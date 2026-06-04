import pycom
import machine
import time
from network import WLAN, LTE
from mqtt import MQTTClient
import socket

## SET UP MQTT Connection

MQTT_DEVICE_ID = 1
THINGSBOARD_URL = ""
THINGSBOARD_USER = ""
THINGSBOARD_PASS = ""

global conn
conn = None
rx_buf = b""

def sub_cb(topic, msg):
    ## If received MQTT message, relay to ESP32
    print("Received:", topic, msg)
    
    if conn:
        topic_s = topic.decode() if isinstance(topic, bytes) else str(topic)
        msg_s = msg.decode() if isinstance(msg, bytes) else str(msg)
        conn.send((topic_s + ";" + msg_s + "\n").encode())

pycom.heartbeat(False)

print("Starting up!")

## First, set up LTE
lte = LTE()
lte.attach(apn="iot.ht.hr")
print("attaching to LTE..",end='')

while not lte.isattached():
    time.sleep(1)

    print('.',end='')
    #print(lte.send_at_cmd('AT!="fsm"')) ## Connection info
print("attached!")

lte.connect()
print("connecting..",end='')
while not lte.isconnected():
    time.sleep(1)
    print('.',end='')
    #print(lte.send_at_cmd('AT!="showphy"'))
    #print(lte.send_at_cmd('AT!="fsm"'))
print(" connected!")

print(socket.getaddrinfo('pybytes.pycom.io', 80))  

## SET-up WIFI AP
SSID = "PYCOM-ECRKVA"
PASSWORD = "pametnacrkva"

AP_IP  = "192.168.4.1"
AP_NM  = "255.255.255.0"
AP_GW  = "192.168.4.1"
AP_DNS = "8.8.8.8"
PORT = 9000

wlan = WLAN()

wlan.init(mode=WLAN.AP, ssid=SSID, auth=(WLAN.WPA2, PASSWORD), channel=6)
wlan.ifconfig(id=1, config=(AP_IP, AP_NM, AP_GW, AP_DNS))

print("AP STARTED")
print(wlan.ifconfig(id=1))

## Close socket if already started in previous boot
try:
    sock.close()
except:
    pass

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

sock.bind(("0.0.0.0", PORT))
sock.listen(1)

print("Listening on port", PORT)

## Connect to MQTT Client
client = MQTTClient(f"device_{MQTT_DEVICE_ID}", THINGSBOARD_URL ,user=THINGSBOARD_USER, password=THINGSBOARD_PASS, port=1883)

client.set_callback(sub_cb)
client.connect()
client.subscribe(topic=f"{MQTT_DEVICE_ID}/bell/ring")
client.subscribe(topic=f"{MQTT_DEVICE_ID}/bell/pattern")
client.subscribe(topic=f"{MQTT_DEVICE_ID}/bell/reset")
client.subscribe(topic=f"{MQTT_DEVICE_ID}/bell/volume")

while True:
    if conn is None:
        try:
            conn, addr = sock.accept()
            conn.settimeout(5)
            rx_buf = b""
            print("Client:", addr)
        except OSError:
            continue
    
    try:
        data = conn.recv(128)
        if data:
            rx_buf += data
            while b"\n" in rx_buf:
                line, rx_buf = rx_buf.split(b"\n", 1)
                line = line.strip()
                if line:
                    loudness = line.decode()
                    # For ThingsBoard direct MQTT, publish telemetry JSON ???
                    client.publish(topic="v1/devices/me/telemetry", msg='{"loudness":' + loudness + "}")
        else:
            conn.close()
            conn = None
    except Exception as e:
        print("Error:", e)

    client.check_msg()
