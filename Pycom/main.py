import pycom
import machine
import time
import socket
import ujson as json

from network import WLAN, LTE
from mqtt import MQTTClient

# ThingsBoard provisioning

THINGSBOARD_HOST = "161.53.133.253"
THINGSBOARD_PORT = 1883

TB_PYCOM_DEVICE_NAME = "pycom-gateway-real-1"
TB_ESP_DEVICE_NAME = "esp32-bell-node-real-1"

TB_TOKEN_FILE = "/flash/tb_pycom_token.txt"

TB_PROVISION_DEVICE_KEY = "a11aua8as8xd1n3ny573"
TB_PROVISION_DEVICE_SECRET = "brs7jh6eegvoa5h1sa1f"

PROV_TOPIC_REQ = "/provision/request"
PROV_TOPIC_RES = "/provision/response"
PROV_USERNAME = "provision"
PROV_PASSWORD = ""


# MQTT topics

PYCOM_TELEMETRY_TOPIC = "v1/devices/me/telemetry"
PYCOM_ATTRIBUTES_TOPIC = "v1/devices/me/attributes"

GATEWAY_CONNECT_TOPIC = "v1/gateway/connect"
GATEWAY_DISCONNECT_TOPIC = "v1/gateway/disconnect"
GATEWAY_TELEMETRY_TOPIC = "v1/gateway/telemetry"
GATEWAY_ATTRIBUTES_TOPIC = "v1/gateway/attributes"
GATEWAY_RPC_TOPIC = "v1/gateway/rpc"

DIRECT_RPC_REQUEST_TOPIC = "v1/devices/me/rpc/request/+"
DIRECT_RPC_RESPONSE_PREFIX = "v1/devices/me/rpc/response/"

# LTE / WiFi AP / TCP bridge

AP_SSID = "PYCOM-ECRKVA"
AP_PASSWORD = "pametnacrkva"

AP_IP = "192.168.4.1"
AP_NM = "255.255.255.0"
AP_GW = "192.168.4.1"
AP_DNS = "8.8.8.8"

ESP_PORT = 9000

# Runtime state

conn = None
sock = None
rx_buf = b""
TB_TOKEN = None
last_gateway_announce = 0

TIME_OFFSET = 1781270937

## Faking time 'cause we can't fetch it from server
def now_ms():
    return (TIME_OFFSET + int(time.time())) * 1000

def send_time():
    if conn:
        conn.send(("time;{}\n".format(TIME_OFFSET + int(time.time()))).encode())

def load_token():
    try:
        with open(TB_TOKEN_FILE, "r") as f:
            token = f.read().strip()
            return token if token else None
    except:
        return None


def save_token(token):
    try:
        with open(TB_TOKEN_FILE, "w") as f:
            f.write(token)
    except Exception as e:
        print("Could not save token:", e)


def provision_access_token():
    token_holder = {"token": None}

    def prov_cb(topic, msg):
        try:
            data = json.loads(msg)
        except:
            print("Provision response parse failed:", topic, msg)
            return

        print("Provision response:", data)

        if data.get("status") == "SUCCESS":
            token_holder["token"] = data.get("credentialsValue")

    client = MQTTClient(
        "test",
        THINGSBOARD_HOST,
        user=PROV_USERNAME,
        password="",
        port=1883
    )

    client.set_callback(prov_cb)

    print("Provisioning via ThingsBoard...")

    print(socket.getaddrinfo(THINGSBOARD_HOST, THINGSBOARD_PORT))
    s = socket.socket()
    s.connect((THINGSBOARD_HOST, THINGSBOARD_PORT))
    print("TCP OK")
    s.close()

    client.connect()

    client.subscribe(PROV_TOPIC_RES)

    req = {
        "deviceName": TB_PYCOM_DEVICE_NAME,
        "provisionDeviceKey": TB_PROVISION_DEVICE_KEY,
        "provisionDeviceSecret": TB_PROVISION_DEVICE_SECRET
    }

    client.publish(PROV_TOPIC_REQ, json.dumps(req))

    timeout = time.time() + 20
    while token_holder["token"] is None and time.time() < timeout:
        client.check_msg()
        time.sleep(0.1)

    client.disconnect()

    if token_holder["token"] is None:
        raise Exception("Provisioning failed or timed out")

    return token_holder["token"].strip()


def get_access_token():
    global TB_TOKEN

    if TB_TOKEN:
        return TB_TOKEN

    cached = load_token()
    if cached:
        print("Using cached token")
        TB_TOKEN = cached
        return TB_TOKEN

    TB_TOKEN = provision_access_token()
    save_token(TB_TOKEN)
    print("Token saved to flash")
    return TB_TOKEN


def connect_lte():
    lte = LTE()
    lte.attach(apn="iot.ht.hr")
    print("Attaching to LTE...", end="")

    while not lte.isattached():
        time.sleep(1)
        print(".", end="")
    print("\nLTE attached")

    lte.connect()
    print("Connecting LTE...", end="")
    while not lte.isconnected():
        time.sleep(1)
        print(".", end="")
    print("\nLTE connected")

    return lte


def start_ap():
    wlan = WLAN(mode=WLAN.AP, ssid=AP_SSID, auth=(WLAN.WPA2, AP_PASSWORD), channel=6)
    #wlan.init(mode=WLAN.AP, ssid=AP_SSID, auth=(WLAN.WPA2, AP_PASSWORD), channel=6)
    wlan.ifconfig(id=1, config=(AP_IP, AP_NM, AP_GW, AP_DNS))
    print("AP started:", wlan.ifconfig(id=1))
    return wlan


def open_esp_socket():
    global sock
    try:
        sock.close()
    except:
        pass

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("0.0.0.0", ESP_PORT))
    sock.listen(1)

    try:
        sock.settimeout(1)
    except:
        pass

    print("Listening for ESP32 on port", ESP_PORT)


def publish_json(client, topic, payload, qos=0):
    payload_str = json.dumps(payload)
    print("MQTT PUBLISH:", topic, payload_str)
    client.publish(topic, payload_str, qos=qos)


def gateway_connect_esp(client):
    publish_json(client, GATEWAY_CONNECT_TOPIC, {"device": TB_ESP_DEVICE_NAME}, qos=0)
    print("Downstream ESP32 announced:", TB_ESP_DEVICE_NAME)


def gateway_disconnect_esp(client):
    publish_json(client, GATEWAY_DISCONNECT_TOPIC, {"device": TB_ESP_DEVICE_NAME}, qos=0)
    print("Downstream ESP32 disconnected:", TB_ESP_DEVICE_NAME)


def publish_pycom_attributes(client):
    publish_json(client, PYCOM_ATTRIBUTES_TOPIC, {
        "device_role": "lte_gateway",
        "model": "Pycom",
        "firmware_version": "1.0.0"
    }, qos=0)


def publish_esp_attributes(client):
    publish_json(client, GATEWAY_ATTRIBUTES_TOPIC, {
        TB_ESP_DEVICE_NAME: {
            "device_role": "bell_node",
            "model": "ESP32",
            "has_microphone": True,
            "has_bell_actuator": True,
            "microphone_unit": "dBA"
        }
    }, qos=0)


def publish_pycom_telemetry(client, esp_connected=True):
    payload = {
        "gateway_online": True,
        "esp_connected": esp_connected,
        "lte_signal": -82,
        "last_esp_seen": now_ms()
    }
    publish_json(client, PYCOM_TELEMETRY_TOPIC, payload, qos=0)


def publish_esp_telemetry(client, values):
    payload = {
        TB_ESP_DEVICE_NAME: [
            {
                "ts": now_ms(),
                "values": values
            }
        ]
    }
    publish_json(client, GATEWAY_TELEMETRY_TOPIC, payload, qos=0)


def send_to_esp(line):
    global conn
    if not conn:
        return False
    try:
        conn.send((line + "\n").encode())
        print("→ ESP:", line)
        return True
    except Exception as e:
        print("ESP send failed:", e)
        try:
            conn.close()
        except:
            pass
        conn = None
        return False


def rpc_to_command(method, params):
    if params is None:
        params = {}

    if not isinstance(params, dict):
        params = {"value": params}

    if method in ("bell.ring", "ring"):
        bell = params.get("bell", 1)
        return "ring;{}".format(bell), {"success": True, "bell": bell}

    if method in ("bell.pattern", "pattern"):
        pattern = params.get("pattern", "")
        return "pattern;{}".format(pattern), {"success": True, "pattern": pattern}

    if method in ("bell.reset", "reset"):
        return "reset;1", {"success": True}

    return None, {"success": False, "message": "Unsupported method: {}".format(method)}


def handle_gateway_rpc(payload):
    """
    Expected shape:
    {
      "device": "esp32-bell-node-001",
      "data": {
        "id": 1,
        "method": "bell.pattern",
        "params": {"pattern": "..."}
      }
    }
    """
    device = payload.get("device")
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload

    if device != TB_ESP_DEVICE_NAME:
        print("Ignoring gateway RPC for device:", device)
        return

    rpc_id = data.get("id")
    method = data.get("method")
    params = data.get("params")

    print("Gateway RPC:", device, rpc_id, method, params)

    cmd, response = rpc_to_command(method, params)
    if cmd:
        send_to_esp(cmd)

        if rpc_id is not None:
            publish_json(client, GATEWAY_RPC_TOPIC, {
                "device": TB_ESP_DEVICE_NAME,
                "id": rpc_id,
                "data": response
            }, qos=0)


def handle_direct_rpc(topic, payload):
    """
    Fallback: direct RPC sent to the Pycom gateway device.
    """
    request_id = topic.split("/")[-1]
    method = payload.get("method")
    params = payload.get("params")

    print("Direct RPC:", request_id, method, params)

    cmd, response = rpc_to_command(method, params)
    if cmd:
        send_to_esp(cmd)

    publish_json(client, DIRECT_RPC_RESPONSE_PREFIX + str(request_id), response, qos=0)


def handle_mqtt_message(topic, msg):
    try:
        raw = msg.decode() if isinstance(msg, bytes) else msg
    except:
        raw = str(msg)

    print("MQTT IN:", topic, raw)

    try:
        payload = json.loads(raw)
    except Exception as e:
        print("Bad JSON:", e)
        return

    if topic == GATEWAY_RPC_TOPIC:
        handle_gateway_rpc(payload)
        return

    if topic.startswith("v1/devices/me/rpc/request/"):
        handle_direct_rpc(topic, payload)
        return


def mqtt_callback(topic, msg):
    handle_mqtt_message(topic, msg)


def read_from_esp_and_publish(client):
    global conn, rx_buf

    if not conn:
        return

    try:
        data = conn.recv(128)
        if not data:
            try:
                conn.close()
            except:
                pass
            conn = None
            print("ESP disconnected")
            return

        rx_buf += data

        while b"\n" in rx_buf:
            line, rx_buf = rx_buf.split(b"\n", 1)
            line = line.strip()
            if not line:
                continue

            text = line.decode()
            print("ESP -> Pycom:", text)

            # Accept either plain loudness or JSON
            try:
                value = float(text)
                publish_esp_telemetry(client, {
                    "microphone_loudness": value,
                    "esp_online": True
                })
            except:
                try:
                    obj = json.loads(text)
                    if isinstance(obj, dict):
                        publish_esp_telemetry(client, obj)
                except:
                    publish_esp_telemetry(client, {
                        "raw": text,
                        "esp_online": True
                    })

    except OSError:
        pass
    except Exception as e:
        print("ESP read error:", e)


def main():
    global client, conn, last_gateway_announce, rx_buf
    last_time_sync = 0

    pycom.heartbeat(False)
    print("Starting up...")

    connect_lte()
    token = get_access_token()

    client = MQTTClient(
        TB_PYCOM_DEVICE_NAME,
        THINGSBOARD_HOST,
        port=THINGSBOARD_PORT,
        user=token,
        password=""
    )
    client.set_callback(mqtt_callback)

    print("Connecting to ThingsBoard...")

    client.connect()

    start_ap()
    open_esp_socket()

    # Subscribe to both gateway RPC and fallback direct RPC
    client.subscribe(GATEWAY_RPC_TOPIC)
    client.subscribe(DIRECT_RPC_REQUEST_TOPIC)

    publish_pycom_attributes(client)
    gateway_connect_esp(client)
    publish_esp_attributes(client)

    print("Waiting for ESP32 TCP client...")

    while True:
        # Keep MQTT serviced
        client.check_msg()

        # Accept ESP32 connection if needed
        if conn is None:
            try:
                conn, addr = sock.accept()
                try:
                    conn.settimeout(1)
                except:
                    pass
                rx_buf = b""
                print("ESP connected from:", addr)
                gateway_connect_esp(client)
            except OSError:
                pass

        # Read data from ESP and publish it upstream
        read_from_esp_and_publish(client)

        # Heartbeat publish every ~30s
        if time.time() - last_gateway_announce > 30:
            last_gateway_announce = time.time()
            publish_pycom_telemetry(client, esp_connected=(conn is not None))

        if conn and time.time() - last_time_sync > 60:
            send_time()
            last_time_sync = time.time()
            print("Time:", TIME_OFFSET + time.time())

        time.sleep(0.1)


try:
    main()
finally:
    try:
        if conn:
            conn.close()
    except:
        pass
    try:
        if sock:
            sock.close()
    except:
        pass