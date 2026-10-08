"""The Connect action repeats SDK registration until XR Game sends data."""

from unittest.mock import MagicMock, patch

from backend import server


sender = MagicMock()
server.bridge.sender = sender
server.bridge.state.get_packet_event_state = MagicMock(side_effect=[(0, "", 0), (0, "", 0), (1, "orientation", 1)])

with patch("backend.server.time.sleep"):
    thread = server.bridge.request_xr_game_initialization()
    thread.join(timeout=2)

assert sender.send_application_name.call_count == 2
sender.send_application_name.assert_called_with("Glove Telemetry")
print("XR Game initialization handshake checks passed")
