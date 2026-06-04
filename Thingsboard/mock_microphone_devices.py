import json
import os
import random
import time
import threading
import math

import paho.mqtt.client as mqtt
from dotenv import load_dotenv

load_dotenv()

TB_MQTT_HOST = os.getenv("TB_MQTT_HOST", "161.53.133.253")
TB_MQTT_PORT = int(os.getenv("TB_MQTT_PORT", "1883"))

TB_TOKEN_FILE = os.getenv("TB_TOKEN_FILE", ".tb_token")


TB_DEVICE_NAME = os.getenv("TB_DEVICE_NAME")

TELEMETRY_TOPIC = "v1/devices/me/telemetry"
ATTRIBUTES_TOPIC = "v1/devices/me/attributes"
PROVISION_REQUEST_TOPIC = "/provision/request"
PROVISION_RESPONSE_TOPIC = "/provision/response"

PROVISION_USERNAME = "provision"
PROVISION_TIMEOUT_S = 20

SAMPLING_INTERVAL_S = 5

STATIC_ATTRIBUTES = {
    "device_type": "sound_level_meter",
    "location": "Crkva - glavni brod",
    "firmware_version": "1.0.0",
    "sampling_interval_s": SAMPLING_INTERVAL_S,
    "warning_threshold_db": 70,
    "critical_threshold_db": 85,
    "unit": "dBA",
}

connected_event = threading.Event()
tick = 0


def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0 or str(reason_code) == "Success":
        print("Connected to ThingsBoard")
        connected_event.set()
    else:
        print("Connection failed:", reason_code)


def on_disconnect(client, userdata, flags, reason_code, properties=None):
    print("Disconnected:", reason_code)
    connected_event.clear()


def generate_loudness(tick: int) -> float:
    ambient = 47.5 + 7.5 * math.sin(2 * math.pi * tick / 120)
    jitter = random.uniform(-3.0, 3.0)
    burst = random.uniform(15.0, 40.0) if random.random() < 0.10 else 0.0
    return round(max(30.0, min(95.0, ambient + jitter + burst)), 1)


def provision_access_token():

    device_name = TB_DEVICE_NAME
    prov_key = os.getenv("TB_PROVISION_DEVICE_KEY")
    prov_secret = os.getenv("TB_PROVISION_DEVICE_SECRET")

    if not device_name:
        raise RuntimeError(
            "TB_DEVICE_NAME is required to provision a new device "
            "(must be stable and unique per bell tower)."
        )
    if not prov_key or not prov_secret:
        raise RuntimeError(
            "Provisioning requires TB_PROVISION_DEVICE_KEY and "
            "TB_PROVISION_DEVICE_SECRET to be set."
        )

    connected = threading.Event()
    subscribed = threading.Event()
    responded = threading.Event()
    sub_lock = threading.Lock()
    state = {
        "connect_rc": None,
        "payload": None,
        "sub_mid": None,
        "sub_ok": False,
        "sub_error": None,
    }

    def on_prov_connect(client, userdata, flags, reason_code, properties):
        if reason_code == 0 or str(reason_code) == "Success":
            state["connect_rc"] = 0
        else:
            state["connect_rc"] = reason_code
        connected.set()

    def on_prov_subscribe(client, userdata, mid, reason_code_list, properties):
        with sub_lock:
            if state["sub_mid"] is None or mid != state["sub_mid"]:
                return
        rejected = [rc for rc in reason_code_list if getattr(rc, "is_failure", False)]
        if rejected:
            state["sub_error"] = f"broker rejected subscription ({rejected})"
        else:
            state["sub_ok"] = True
        subscribed.set()

    def on_prov_message(client, userdata, msg):
        state["payload"] = msg.payload
        responded.set()

    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"provision-{device_name}",
    )
    client.username_pw_set(PROVISION_USERNAME)
    client.on_connect = on_prov_connect
    client.on_subscribe = on_prov_subscribe
    client.on_message = on_prov_message

    print(f"Provisioning device '{device_name}' via {TB_MQTT_HOST}:{TB_MQTT_PORT} ...")
    client.connect(TB_MQTT_HOST, TB_MQTT_PORT, keepalive=60)
    client.loop_start()
    try:
        if not connected.wait(timeout=PROVISION_TIMEOUT_S):
            raise RuntimeError("Provisioning connection timed out.")
        if state["connect_rc"] != 0:
            raise RuntimeError(
                f"Provisioning connection failed (reason: {state['connect_rc']})."
            )


        with sub_lock:
            sub_result, sub_mid = client.subscribe(PROVISION_RESPONSE_TOPIC, qos=1)
            if sub_result != mqtt.MQTT_ERR_SUCCESS:
                raise RuntimeError(
                    f"Failed to subscribe to provisioning response (code: {sub_result})."
                )
            state["sub_mid"] = sub_mid
        if not subscribed.wait(timeout=PROVISION_TIMEOUT_S):
            raise RuntimeError("Timed out waiting for provisioning subscription ack.")
        if not state["sub_ok"]:
            raise RuntimeError(
                f"Provisioning subscription was rejected ({state['sub_error']})."
            )

        request = {
            "deviceName": device_name,
            "provisionDeviceKey": prov_key,
            "provisionDeviceSecret": prov_secret,
        }
        info = client.publish(
            PROVISION_REQUEST_TOPIC, json.dumps(request), qos=1
        )
        if info.rc != mqtt.MQTT_ERR_SUCCESS:
            raise RuntimeError(
                f"Failed to publish provisioning request (code: {info.rc})."
            )
        try:
            info.wait_for_publish(timeout=PROVISION_TIMEOUT_S)
        except (ValueError, RuntimeError) as exc:
            raise RuntimeError(f"Provisioning request was not published: {exc}")
        if not info.is_published():
            raise RuntimeError("Timed out confirming the provisioning request publish.")

        if not responded.wait(timeout=PROVISION_TIMEOUT_S):
            raise RuntimeError("Provisioning timed out waiting for a response.")
    finally:
        client.loop_stop()
        client.disconnect()

    raw = state["payload"]
    try:
        response = json.loads(raw.decode() if isinstance(raw, bytes) else raw)
    except (ValueError, AttributeError) as exc:
        raise RuntimeError(f"Malformed provisioning response (not valid JSON): {exc}")

    if not isinstance(response, dict):
        raise RuntimeError(
            "Malformed provisioning response (expected a JSON object)."
        )

    if response.get("status") != "SUCCESS":
        raise RuntimeError(
            f"Provisioning failed: status={response.get('status')!r}, "
            f"error={response.get('errorMsg')!r}"
        )
    if response.get("credentialsType") != "ACCESS_TOKEN":
        raise RuntimeError(
            f"Unexpected credentialsType: {response.get('credentialsType')!r} "
            "(expected 'ACCESS_TOKEN')."
        )

    token = response.get("credentialsValue")
    if not isinstance(token, str) or not token.strip():
        raise RuntimeError("Provisioning response missing a valid credentialsValue.")

    print("Provisioning succeeded; access token obtained.")
    return token.strip()


def save_token(token):

    directory = os.path.dirname(os.path.abspath(TB_TOKEN_FILE)) or "."
    os.makedirs(directory, exist_ok=True)
    tmp_path = os.path.join(directory, f"{os.path.basename(TB_TOKEN_FILE)}.tmp")
    try:
        fd = os.open(tmp_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(token)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, TB_TOKEN_FILE)
    except Exception:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        raise


def get_access_token():
    explicit = (os.getenv("TB_ACCESS_TOKEN") or "").strip()
    if explicit:
        print("Using TB_ACCESS_TOKEN from environment.")
        return explicit

    if os.path.exists(TB_TOKEN_FILE):
        with open(TB_TOKEN_FILE) as f:
            cached = f.read().strip()
        if cached:
            print(f"Using cached access token from {TB_TOKEN_FILE}.")
            return cached

    token = provision_access_token()
    save_token(token)
    print(f"Access token cached to {TB_TOKEN_FILE}.")
    return token


def main():
    global tick

    access_token = get_access_token()

    client_id = f"microphone-simulator-{TB_DEVICE_NAME or os.getpid()}"

    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id=client_id
    )
    client.username_pw_set(access_token, password="")
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect

    print(f"Connecting to {TB_MQTT_HOST}:{TB_MQTT_PORT} ...")
    client.connect(TB_MQTT_HOST, TB_MQTT_PORT, keepalive=60)
    client.loop_start()

    if not connected_event.wait(timeout=10):
        raise RuntimeError("Could not connect within 10 seconds")

    client.publish(ATTRIBUTES_TOPIC, json.dumps(STATIC_ATTRIBUTES), qos=1)

    try:
        while True:
            loudness = generate_loudness(tick)
            tick += 1

            telemetry = {"loudness": loudness}
            client.publish(TELEMETRY_TOPIC, json.dumps(telemetry), qos=1)

            # Also publish the latest loudness as an attribute (overwrites each
            # cycle; no history kept server-side).
            client.publish(ATTRIBUTES_TOPIC, json.dumps({"loudness": loudness}), qos=1)

            print(f"[tick={tick:04d}] loudness={loudness} dB")

            time.sleep(SAMPLING_INTERVAL_S)

    except KeyboardInterrupt:
        print("Stopping...")
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()