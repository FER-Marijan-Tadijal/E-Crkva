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
TB_ACCESS_TOKEN = os.getenv("TB_ACCESS_TOKEN")

if not TB_ACCESS_TOKEN:
    raise RuntimeError("Missing TB_ACCESS_TOKEN in .env")

TELEMETRY_TOPIC = "v1/devices/me/telemetry"
ATTRIBUTES_TOPIC = "v1/devices/me/attributes"

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


def main():
    global tick

    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id="microphone-simulator"
    )
    client.username_pw_set(TB_ACCESS_TOKEN, password="")
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect

    print(f"Connecting to {TB_MQTT_HOST}:{TB_MQTT_PORT} ...")
    client.connect(TB_MQTT_HOST, TB_MQTT_PORT, keepalive=60)
    client.loop_start()

    if not connected_event.wait(timeout=10):
        raise RuntimeError("Could not connect within 10 seconds")

    try:
        while True:
            loudness = generate_loudness(tick)
            tick += 1

            telemetry = {"loudness": loudness}
            client.publish(TELEMETRY_TOPIC, json.dumps(telemetry), qos=1)

            attributes = {"loudness": loudness}
            client.publish(ATTRIBUTES_TOPIC, json.dumps(attributes), qos=1)

            print(f"[tick={tick:04d}] loudness={loudness} dB")

            time.sleep(5)

    except KeyboardInterrupt:
        print("Stopping...")
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()