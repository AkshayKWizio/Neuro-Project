# Local StretchSense bridge

The bridge uses the supplied Reality Python SDK 0.4.1. It listens for OSC v1
telemetry on `127.0.0.1:9002`, sends glove commands to `127.0.0.1:9003`, and
serves the dashboard, API, and WebSocket on `127.0.0.1:3000`.

The vendored SDK remains under its original MIT license and copyright notice.
