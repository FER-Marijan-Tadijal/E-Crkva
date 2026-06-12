import json
import math
import os
import random
import threading
import time
from pathlib import Path
from typing import Any, Optional

import paho.mqtt.client as mqtt
from dotenv import load_dotenv


load_dotenv()

TB_MQTT_HOST = os.getenv("TB_MQTT_HOST", "161.53.133.253").strip()
TB_MQTT_PORT = int(os.getenv("TB_MQTT_PORT", "1883"))

TB_PYCOM_DEVICE_NAME = os.getenv("TB_PYCOM_DEVICE_NAME", "pycom-gateway-001").strip()
TB_ESP_DEVICE_NAME = os.getenv("TB_ESP_DEVICE_NAME", "esp32-bell-node-001").strip()

TB_PYCOM_TOKEN_FILE = os.getenv("TB_PYCOM_TOKEN_FILE", ".tb_pycom_gateway_token").strip()

PROVISION_REQUEST_TOPIC = "/provision/request"
PROVISION_RESPONSE_TOPIC = "/provision/response"
PROVISION_USERNAME = "provision"
PROVISION_TIMEOUT_S = 20

PYCOM_TELEMETRY_TOPIC = "v1/devices/me/telemetry"
PYCOM_ATTRIBUTES_TOPIC = "v1/devices/me/attributes"

GATEWAY_CONNECT_TOPIC = "v1/gateway/connect"
GATEWAY_DISCONNECT_TOPIC = "v1/gateway/disconnect"
GATEWAY_TELEMETRY_TOPIC = "v1/gateway/telemetry"
GATEWAY_ATTRIBUTES_TOPIC = "v1/gateway/attributes"
GATEWAY_RPC_TOPIC = "v1/gateway/rpc"

# Fallback/direct Pycom RPC topics.
# Use these if ThingsBoard gateway RPC to the ESP32 downstream device times out.
DIRECT_RPC_REQUEST_TOPIC = "v1/devices/me/rpc/request/+"
DIRECT_RPC_RESPONSE_TOPIC_PREFIX = "v1/devices/me/rpc/response/"

SAMPLING_INTERVAL_S = 5

connected_event = threading.Event()
tick = 0


PYCOM_STATIC_ATTRIBUTES = {
    "device_role": "lte_gateway",
    "model": "Pycom",
    "firmware_version": "1.0.0",
    "location": "Crkva - zvonik",
}

ESP_STATIC_ATTRIBUTES = {
    "device_role": "bell_node",
    "model": "ESP32",
    "location": "Crkva - zvonik",
    "has_microphone": True,
    "has_bell_actuator": True,
    "microphone_unit": "dBA",
    "warning_threshold_db": 70,
    "critical_threshold_db": 85,
}


def mqtt_success(reason_code: Any) -> bool:
    return reason_code == 0 or str(reason_code) == "Success"


def on_connect(client, userdata, flags, reason_code, properties):
    if mqtt_success(reason_code):
        print("Connected to ThingsBoard as Pycom gateway")
        connected_event.set()
    else:
        print("Connection failed:", reason_code)


def on_disconnect(client, userdata, flags, reason_code, properties=None):
    print("Disconnected:", reason_code)
    connected_event.clear()


def on_subscribe(client, userdata, mid, reason_code_list, properties):
    print(f"Subscribed: mid={mid}, reason_codes={reason_code_list}")


def on_publish(client, userdata, mid, reason_code, properties):
    print(f"Published: mid={mid}, reason_code={reason_code}")


def generate_loudness(tick_value: int, force_loud: bool = False, force_quiet: bool = False) -> float:
    if force_loud:
        return round(random.uniform(80.0, 92.0), 1)

    if force_quiet:
        return round(random.uniform(35.0, 48.0), 1)

    ambient = 47.5 + 7.5 * math.sin(2 * math.pi * tick_value / 120)
    jitter = random.uniform(-3.0, 3.0)
    burst = random.uniform(15.0, 40.0) if random.random() < 0.10 else 0.0

    return round(max(30.0, min(95.0, ambient + jitter + burst)), 1)


def provision_pycom_access_token() -> str:
    provision_key = os.getenv("TB_PROVISION_DEVICE_KEY")
    provision_secret = os.getenv("TB_PROVISION_DEVICE_SECRET")

    if not TB_PYCOM_DEVICE_NAME:
        raise RuntimeError("TB_PYCOM_DEVICE_NAME is required.")

    if not provision_key or not provision_secret:
        raise RuntimeError(
            "Provisioning requires TB_PROVISION_DEVICE_KEY and "
            "TB_PROVISION_DEVICE_SECRET in .env."
        )

    connected = threading.Event()
    subscribed = threading.Event()
    responded = threading.Event()

    state = {
        "connect_rc": None,
        "payload": None,
        "sub_mid": None,
        "sub_ok": False,
        "sub_error": None,
    }

    sub_lock = threading.Lock()

    def on_prov_connect(client, userdata, flags, reason_code, properties):
        state["connect_rc"] = 0 if mqtt_success(reason_code) else reason_code
        connected.set()

    def on_prov_subscribe(client, userdata, mid, reason_code_list, properties):
        with sub_lock:
            if state["sub_mid"] is None or mid != state["sub_mid"]:
                return

        rejected = [rc for rc in reason_code_list if getattr(rc, "is_failure", False)]

        if rejected:
            state["sub_error"] = f"broker rejected subscription: {rejected}"
        else:
            state["sub_ok"] = True

        subscribed.set()

    def on_prov_message(client, userdata, msg):
        state["payload"] = msg.payload
        responded.set()

    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"provision-{TB_PYCOM_DEVICE_NAME}",
    )

    client.username_pw_set(PROVISION_USERNAME)
    client.on_connect = on_prov_connect
    client.on_subscribe = on_prov_subscribe
    client.on_message = on_prov_message

    print(f"Provisioning Pycom gateway '{TB_PYCOM_DEVICE_NAME}' via {TB_MQTT_HOST}:{TB_MQTT_PORT} ...")

    client.connect(TB_MQTT_HOST, TB_MQTT_PORT, keepalive=60)
    client.loop_start()

    try:
        if not connected.wait(timeout=PROVISION_TIMEOUT_S):
            raise RuntimeError("Provisioning connection timed out.")

        if state["connect_rc"] != 0:
            raise RuntimeError(f"Provisioning connection failed: {state['connect_rc']}")

        with sub_lock:
            sub_result, sub_mid = client.subscribe(PROVISION_RESPONSE_TOPIC, qos=1)
            state["sub_mid"] = sub_mid

        if sub_result != mqtt.MQTT_ERR_SUCCESS:
            raise RuntimeError(f"Failed to subscribe to provisioning response: {sub_result}")

        if not subscribed.wait(timeout=PROVISION_TIMEOUT_S):
            raise RuntimeError("Timed out waiting for provisioning subscription ack.")

        if not state["sub_ok"]:
            raise RuntimeError(f"Provisioning subscription rejected: {state['sub_error']}")

        request = {
            "deviceName": TB_PYCOM_DEVICE_NAME,
            "provisionDeviceKey": provision_key,
            "provisionDeviceSecret": provision_secret,
        }

        info = client.publish(PROVISION_REQUEST_TOPIC, json.dumps(request), qos=1)

        if info.rc != mqtt.MQTT_ERR_SUCCESS:
            raise RuntimeError(f"Failed to publish provisioning request: {info.rc}")

        info.wait_for_publish(timeout=PROVISION_TIMEOUT_S)

        if not responded.wait(timeout=PROVISION_TIMEOUT_S):
            raise RuntimeError("Provisioning timed out waiting for response.")

    finally:
        client.loop_stop()
        client.disconnect()

    raw = state["payload"]

    try:
        response = json.loads(raw.decode() if isinstance(raw, bytes) else raw)
    except Exception as exc:
        raise RuntimeError(f"Malformed provisioning response: {exc}") from exc

    if response.get("status") != "SUCCESS":
        raise RuntimeError(
            f"Provisioning failed: status={response.get('status')}, "
            f"error={response.get('errorMsg')}"
        )

    if response.get("credentialsType") != "ACCESS_TOKEN":
        raise RuntimeError(
            f"Unexpected credentialsType={response.get('credentialsType')}; "
            "expected ACCESS_TOKEN."
        )

    token = response.get("credentialsValue")

    if not isinstance(token, str) or not token.strip():
        raise RuntimeError("Provisioning response missing credentialsValue.")

    print("Provisioning succeeded; Pycom access token obtained.")
    return token.strip()


def save_token(token: str) -> None:
    token_path = Path(TB_PYCOM_TOKEN_FILE)
    tmp_path = token_path.with_suffix(token_path.suffix + ".tmp")

    token_path.parent.mkdir(parents=True, exist_ok=True)

    with open(tmp_path, "w") as file:
        file.write(token)
        file.flush()
        os.fsync(file.fileno())

    os.replace(tmp_path, token_path)


def get_pycom_access_token() -> str:
    explicit = (os.getenv("TB_PYCOM_ACCESS_TOKEN") or "").strip()

    if explicit:
        print("Using TB_PYCOM_ACCESS_TOKEN from environment.")
        return explicit

    token_path = Path(TB_PYCOM_TOKEN_FILE)

    if token_path.exists():
        cached = token_path.read_text().strip()
        if cached:
            print(f"Using cached Pycom token from {TB_PYCOM_TOKEN_FILE}.")
            return cached

    token = provision_pycom_access_token()
    save_token(token)
    print(f"Pycom access token cached to {TB_PYCOM_TOKEN_FILE}.")
    return token


def publish_json(client: mqtt.Client, topic: str, payload: dict, qos: int = 0) -> None:
    """
    Default QoS is 0 to avoid blocking while debugging ThingsBoard gateway topics.
    Use qos=1 only when you explicitly need PUBACK confirmation.
    """
    payload_json = json.dumps(payload)

    print("\nMQTT PUBLISH")
    print("topic:", topic)
    print("payload:", payload_json)

    info = client.publish(topic, payload_json, qos=qos)

    if info.rc != mqtt.MQTT_ERR_SUCCESS:
        raise RuntimeError(f"Publish failed on topic {topic}: rc={info.rc}")

    if qos > 0:
        info.wait_for_publish(timeout=10)

        if not info.is_published():
            print(f"WARNING: Publish was not confirmed for topic {topic}, continuing anyway.")


def gateway_connect_esp(client: mqtt.Client) -> None:
    payload = {
        "device": TB_ESP_DEVICE_NAME
    }

    publish_json(client, GATEWAY_CONNECT_TOPIC, payload, qos=0)
    print(f"Gateway announced downstream ESP32 device: {TB_ESP_DEVICE_NAME}")

    # Give ThingsBoard a moment to register/update the downstream gateway session.
    time.sleep(2)


def gateway_disconnect_esp(client: mqtt.Client) -> None:
    payload = {
        "device": TB_ESP_DEVICE_NAME
    }

    publish_json(client, GATEWAY_DISCONNECT_TOPIC, payload, qos=0)
    print(f"Gateway disconnected downstream ESP32 device: {TB_ESP_DEVICE_NAME}")


def publish_pycom_attributes(client: mqtt.Client) -> None:
    publish_json(client, PYCOM_ATTRIBUTES_TOPIC, PYCOM_STATIC_ATTRIBUTES, qos=0)
    print("Published Pycom static attributes.")


def publish_esp_attributes(client: mqtt.Client) -> None:
    payload = {
        TB_ESP_DEVICE_NAME: ESP_STATIC_ATTRIBUTES
    }

    publish_json(client, GATEWAY_ATTRIBUTES_TOPIC, payload, qos=0)
    print("Published ESP32 static attributes through gateway.")


def publish_pycom_health(client: mqtt.Client, tick_value: int, esp_connected: bool = True) -> None:
    # LTE signal in dBm. -70 is good, -110 is weak.
    lte_signal = round(-82 + random.uniform(-8, 8), 1)

    payload = {
        "lte_signal": lte_signal,
        "gateway_online": True,
        "gateway_status": "ok",
        "esp_connected": esp_connected,
        "last_esp_seen": int(time.time() * 1000),
        "uptime_tick": tick_value,
    }

    publish_json(client, PYCOM_TELEMETRY_TOPIC, payload, qos=0)
    print(f"Pycom telemetry: {payload}")


def publish_esp_telemetry(client: mqtt.Client, values: dict) -> None:
    payload = {
        TB_ESP_DEVICE_NAME: [
            {
                "ts": int(time.time() * 1000),
                "values": values,
            }
        ]
    }

    publish_json(client, GATEWAY_TELEMETRY_TOPIC, payload, qos=0)
    print(f"ESP32 telemetry sent through gateway for device '{TB_ESP_DEVICE_NAME}': {values}")


def publish_normal_esp_state(client: mqtt.Client, tick_value: int) -> None:
    values = {
        "microphone_loudness": generate_loudness(tick_value),
        "bell_state": "idle",
        "last_command_status": "ok",
        "esp_online": True,
    }

    publish_esp_telemetry(client, values)


def test_too_loud_alarm(client: mqtt.Client) -> None:
    print("\nTEST: Too loud alarm")
    publish_esp_telemetry(
        client,
        {
            "microphone_loudness": 88.0,
            "bell_state": "idle",
            "esp_online": True,
        },
    )


def test_clear_too_loud_alarm(client: mqtt.Client) -> None:
    print("\nTEST: Clear too loud alarm")
    publish_esp_telemetry(
        client,
        {
            "microphone_loudness": 45.0,
            "bell_state": "idle",
            "esp_online": True,
        },
    )


def test_bell_error_alarm(client: mqtt.Client) -> None:
    print("\nTEST: Bell error alarm")
    publish_esp_telemetry(
        client,
        {
            "bell_state": "error",
            "last_command_status": "failed",
            "last_error": "relay_not_responding",
            "esp_online": True,
        },
    )


def test_clear_bell_error_alarm(client: mqtt.Client) -> None:
    print("\nTEST: Clear bell error alarm")
    publish_esp_telemetry(
        client,
        {
            "bell_state": "idle",
            "last_command_status": "ok",
            "last_error": "",
            "esp_online": True,
        },
    )


def test_bell_not_heard_alarm(client: mqtt.Client) -> None:
    print("\nTEST: Bell not heard alarm")

    # First publish quiet microphone value. Your rule chain will later read
    # latest microphone_loudness after delay.
    publish_esp_telemetry(
        client,
        {
            "microphone_loudness": 38.0,
            "bell_state": "idle",
            "esp_online": True,
        },
    )

    time.sleep(1)

    publish_esp_telemetry(
        client,
        {
            "bell_event": "ring_started",
            "bell_state": "ringing",
            "last_ring_time": int(time.time() * 1000),
            "last_command_status": "ok",
            "last_bell": 1,
            "esp_online": True,
        },
    )


def test_clear_bell_not_heard_alarm(client: mqtt.Client) -> None:
    print("\nTEST: Clear bell not heard alarm")

    publish_esp_telemetry(
        client,
        {
            "microphone_loudness": 82.0,
            "bell_state": "ringing",
            "esp_online": True,
        },
    )

    time.sleep(1)

    publish_esp_telemetry(
        client,
        {
            "bell_event": "ring_started",
            "bell_state": "ringing",
            "last_ring_time": int(time.time() * 1000),
            "last_command_status": "ok",
            "last_bell": 1,
            "esp_online": True,
        },
    )

    time.sleep(2)

    publish_esp_telemetry(
        client,
        {
            "bell_state": "idle",
            "last_command_status": "ok",
            "esp_online": True,
        },
    )


def test_pycom_weak_lte_alarm(client: mqtt.Client) -> None:
    print("\nTEST: Weak LTE signal alarm")

    payload = {
        "lte_signal": -112,
        "gateway_online": True,
        "gateway_status": "ok",
        "esp_connected": True,
        "last_esp_seen": int(time.time() * 1000),
    }

    publish_json(client, PYCOM_TELEMETRY_TOPIC, payload, qos=0)
    print(f"Pycom telemetry: {payload}")


def test_pycom_clear_weak_lte_alarm(client: mqtt.Client) -> None:
    print("\nTEST: Clear weak LTE signal alarm")

    payload = {
        "lte_signal": -82,
        "gateway_online": True,
        "gateway_status": "ok",
        "esp_connected": True,
        "last_esp_seen": int(time.time() * 1000),
    }

    publish_json(client, PYCOM_TELEMETRY_TOPIC, payload, qos=0)
    print(f"Pycom telemetry: {payload}")


def test_esp_disconnected_alarm(client: mqtt.Client) -> None:
    print("\nTEST: ESP disconnected alarm")

    payload = {
        "lte_signal": -82,
        "gateway_online": True,
        "gateway_status": "ok",
        "esp_connected": False,
        "last_esp_seen": int(time.time() * 1000),
    }

    publish_json(client, PYCOM_TELEMETRY_TOPIC, payload, qos=0)
    print(f"Pycom telemetry: {payload}")


def execute_bell_command(client: mqtt.Client, method: Optional[str], params: Any) -> dict:
    """
    Simulates forwarding the RPC command from Pycom to ESP32 and then publishes
    ESP32 telemetry back to ThingsBoard through v1/gateway/telemetry.
    """
    if params is None:
        params = {}

    if not isinstance(params, dict):
        params = {"value": params}

    if method == "bell.ring":
        bell = params.get("bell", 1)

        publish_esp_telemetry(
            client,
            {
                "bell_event": "ring_started",
                "bell_state": "ringing",
                "last_command_status": "ok",
                "last_bell": bell,
                "last_ring_time": int(time.time() * 1000),
            },
        )

        time.sleep(1)

        publish_esp_telemetry(
            client,
            {
                "microphone_loudness": 85.0,
                "bell_state": "ringing",
                "last_command_status": "ok",
            },
        )

        time.sleep(1)

        publish_esp_telemetry(
            client,
            {
                "bell_state": "idle",
                "last_command_status": "ok",
            },
        )

        return {
            "success": True,
            "message": f"Bell {bell} rang successfully.",
        }

    if method == "bell.reset":
        publish_esp_telemetry(
            client,
            {
                "bell_state": "idle",
                "last_command_status": "ok",
                "last_error": "",
                "last_pattern": "",
            },
        )

        return {
            "success": True,
            "message": "Bell patterns reset.",
        }

    if method == "bell.pattern":
        pattern = params.get("pattern")

        publish_esp_telemetry(
            client,
            {
                "bell_event": "ring_started",
                "bell_state": "ringing",
                "last_command_status": "ok",
                "last_pattern": pattern or "",
                "last_ring_time": int(time.time() * 1000),
            },
        )

        time.sleep(1)

        publish_esp_telemetry(
            client,
            {
                "microphone_loudness": 84.0,
                "bell_state": "ringing",
                "last_command_status": "ok",
                "last_pattern": pattern or "",
            },
        )

        time.sleep(1)

        publish_esp_telemetry(
            client,
            {
                "bell_state": "idle",
                "last_command_status": "ok",
                "last_pattern": pattern or "",
            },
        )

        return {
            "success": True,
            "message": "Pattern executed.",
            "pattern": pattern,
        }

    publish_esp_telemetry(
        client,
        {
            "bell_state": "error",
            "last_command_status": "failed",
            "last_error": f"Unsupported RPC method: {method}",
        },
    )

    return {
        "success": False,
        "message": f"Unsupported RPC method: {method}",
    }


def handle_gateway_rpc(client: mqtt.Client, payload: dict) -> None:
    """
    Handles ThingsBoard Gateway RPC.

    Expected request format:
    {
      "device": "esp32-bell-node-001",
      "data": {
        "id": 1,
        "method": "bell.pattern",
        "params": {"pattern": "..."}
      }
    }

    Expected response format:
    {
      "device": "esp32-bell-node-001",
      "id": 1,
      "data": {"success": true}
    }
    """
    print("\nRAW GATEWAY RPC PAYLOAD:", payload)

    # Ignore gateway RPC responses that might be echoed back to this client.
    if "id" in payload and "data" in payload and isinstance(payload.get("data"), dict):
        data_candidate = payload.get("data") or {}
        if "method" not in data_candidate:
            print("Ignoring echoed gateway RPC response.")
            return

    device = payload.get("device")

    if "data" in payload and isinstance(payload["data"], dict):
        data = payload["data"]
    else:
        data = payload

    rpc_id = data.get("id")
    method = data.get("method")
    params = data.get("params") or {}

    print(f"Gateway RPC parsed: device={device}, id={rpc_id}, method={method}, params={params}")

    if device != TB_ESP_DEVICE_NAME:
        print(f"Gateway RPC ignored. Expected device={TB_ESP_DEVICE_NAME}, got device={device}")
        return

    response_data = execute_bell_command(client, method, params)

    if rpc_id is not None:
        response = {
            "device": TB_ESP_DEVICE_NAME,
            "id": rpc_id,
            "data": response_data,
        }

        publish_json(client, GATEWAY_RPC_TOPIC, response, qos=0)
        print(f"Gateway RPC response sent: {response}")
    else:
        print("Gateway RPC had no id, so no response was sent.")


def handle_direct_pycom_rpc(client: mqtt.Client, request_id: str, payload: dict) -> None:
    print("\nRAW DIRECT PYCOM RPC PAYLOAD:", payload)

    method = payload.get("method")
    params = payload.get("params") or {}

    if not isinstance(params, dict):
        params = {"value": params}

    target_device = params.get("targetDevice", TB_ESP_DEVICE_NAME)

    print(
        f"Direct Pycom RPC parsed: request_id={request_id}, "
        f"targetDevice={target_device}, method={method}, params={params}"
    )

    if target_device != TB_ESP_DEVICE_NAME:
        response = {
            "success": False,
            "message": f"Unknown targetDevice: {target_device}",
        }
    else:
        response = execute_bell_command(client, method, params)

    response_topic = DIRECT_RPC_RESPONSE_TOPIC_PREFIX + str(request_id)
    publish_json(client, response_topic, response, qos=0)
    print(f"Direct Pycom RPC response sent on {response_topic}: {response}")


def make_on_message(client_ref: mqtt.Client):
    def on_message(client, userdata, msg):
        raw_payload = msg.payload.decode(errors="replace")

        print("\nMQTT MESSAGE RECEIVED")
        print("topic:", msg.topic)
        print("payload:", raw_payload)

        try:
            payload = json.loads(raw_payload)
        except Exception as exc:
            print(f"Could not parse message on {msg.topic}: {exc}")
            return

        if msg.topic == GATEWAY_RPC_TOPIC:
            handle_gateway_rpc(client_ref, payload)
            return

        if msg.topic.startswith("v1/devices/me/rpc/request/"):
            request_id = msg.topic.split("/")[-1]
            handle_direct_pycom_rpc(client_ref, request_id, payload)
            return

        print(f"Unhandled message on {msg.topic}: {payload}")

    return on_message


def run_initial_rule_chain_tests(client: mqtt.Client) -> None:
    print("\nRunning initial ThingsBoard rule chain tests...")

    publish_pycom_health(client, tick_value=0, esp_connected=True)
    publish_normal_esp_state(client, tick_value=0)

    time.sleep(1)
    test_too_loud_alarm(client)

    time.sleep(1)
    test_clear_too_loud_alarm(client)

    time.sleep(1)
    test_bell_error_alarm(client)

    time.sleep(1)
    test_clear_bell_error_alarm(client)

    time.sleep(1)
    test_bell_not_heard_alarm(client)

    # Wait longer than your rule chain delay so Bell not heard can be evaluated.
    time.sleep(7)

    test_clear_bell_not_heard_alarm(client)

    time.sleep(7)

    test_pycom_weak_lte_alarm(client)

    time.sleep(1)
    test_pycom_clear_weak_lte_alarm(client)

    time.sleep(1)
    test_esp_disconnected_alarm(client)

    print("\nInitial tests finished.\n")


def subscribe_or_raise(client: mqtt.Client, topic: str, qos: int = 1) -> None:
    sub_result, sub_mid = client.subscribe(topic, qos=qos)
    print(f"Subscribe request to {topic}: result={sub_result}, mid={sub_mid}")

    if sub_result != mqtt.MQTT_ERR_SUCCESS:
        raise RuntimeError(f"Failed to subscribe to {topic}: result={sub_result}")


def main():
    global tick

    pycom_access_token = get_pycom_access_token()

    client_id = f"pycom-gateway-simulator-{TB_PYCOM_DEVICE_NAME}"

    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id=client_id,
    )

    client.username_pw_set(pycom_access_token, password="")
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = make_on_message(client)
    client.on_subscribe = on_subscribe
    client.on_publish = on_publish
    client.enable_logger()

    print(f"Connecting Pycom gateway simulator to {TB_MQTT_HOST}:{TB_MQTT_PORT} ...")

    client.connect(TB_MQTT_HOST, TB_MQTT_PORT, keepalive=60)
    client.loop_start()

    if not connected_event.wait(timeout=15):
        raise RuntimeError("Could not connect to ThingsBoard MQTT broker within 15 seconds.")

    # Native gateway RPC to downstream ESP32.
    subscribe_or_raise(client, GATEWAY_RPC_TOPIC, qos=1)

    # Fallback/direct RPC to Pycom gateway itself.
    # Use this if ThingsBoard gateway RPC to the ESP32 device times out.
    subscribe_or_raise(client, DIRECT_RPC_REQUEST_TOPIC, qos=1)

    publish_pycom_attributes(client)
    gateway_connect_esp(client)
    publish_esp_attributes(client)

    print("\nSMOKE TEST: sending one ESP32 telemetry message")
    publish_esp_telemetry(
        client,
        {
            "microphone_loudness": 55.5,
            "bell_state": "idle",
            "last_command_status": "ok",
            "esp_online": True,
        },
    )

    run_initial_rule_chain_tests(client)

    print("Entering normal telemetry loop. Press Ctrl+C to stop.")
    print("Native gateway RPC target: ESP32 device UUID.")
    print("Fallback direct RPC target: Pycom gateway UUID with params.targetDevice set to ESP32 name.")

    try:
        while True:
            # Refresh downstream connection state so ThingsBoard keeps the ESP32 routed through the gateway.
            gateway_connect_esp(client)

            publish_pycom_health(client, tick_value=tick, esp_connected=True)
            publish_normal_esp_state(client, tick_value=tick)

            tick += 1
            time.sleep(SAMPLING_INTERVAL_S)

    except KeyboardInterrupt:
        print("Stopping...")

    finally:
        try:
            gateway_disconnect_esp(client)
        except Exception as exc:
            print(f"Could not disconnect ESP downstream device cleanly: {exc}")

        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()