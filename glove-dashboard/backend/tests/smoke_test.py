"""Send representative OSC v1 packets and verify the local dashboard bridge."""

from __future__ import annotations

import json
import asyncio
import time
from urllib.request import urlopen

import websockets
from pythonosc.udp_client import SimpleUDPClient


client = SimpleUDPClient("127.0.0.1", 9002)
header = [time.time(), "smoke-test", 2, "TEST-RIGHT", "XR"]
client.send_message("/v1/orientation/all", header + [0.1, -0.2, 9.7, 0.01, 0.02, 0.03, 0.99])
client.send_message("/v1/controller_input/all", header + [0, 1, 0.6, 1, 0, 1, 0.8, 0, -0.25, 0.5])
client.send_message("/v1/animation/sliders/all", header + [index / 25 for index in range(25)])

joints: list[float] = []
for index in range(26):
    joints.extend([index * 0.01, index * 0.02, index * 0.03, 0.0, 0.0, 0.0, 1.0])
client.send_message("/v1/animation/kinematic/all", header + joints)
time.sleep(0.2)

with urlopen("http://127.0.0.1:3000/api/state", timeout=2) as response:
    payload = json.load(response)

right = payload["hands"]["right"]
assert payload["meta"]["packet_count"] >= 4
assert right["orientation"]["header"]["serial"] == "TEST-RIGHT"
assert abs(right["orientation"]["orientation"]["w"] - 0.99) < 1e-5
assert abs(right["controller"]["inputs"]["trigger_value"] - 0.8) < 1e-5
assert len(right["kinematic"]["joints"]) == 26
assert len(right["sliders"]) == 25
assert set(payload["exercises"]["right"]["counts"]) == {
    "pronation", "supination", "clockwise", "anticlockwise", "wrist_open", "wrist_close",
}


async def verify_websocket() -> None:
    async with websockets.connect("ws://127.0.0.1:3000/ws") as websocket:
        snapshot = json.loads(await asyncio.wait_for(websocket.recv(), timeout=2))
        assert "meta" in snapshot and "hands" in snapshot


asyncio.run(verify_websocket())
print("OSC -> SDK HandData -> API/WebSocket smoke test passed")
