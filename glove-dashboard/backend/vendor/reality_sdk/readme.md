# Reality OSC Bridge

A modular Python package for handling OSC input/output and emulating multiple input device types based on hand data, and bridging hand data to other systems. Designed for flexibility and integration into XR/VR systems, this SDK supports multiple input device emulation through YAML-based profiles.

## Features

- OSC server with customizable handlers
- Xbox360 virtual gamepad emulation (`vgamepad`) (WINDOWS ONLY)
- Keyboard emulation using `pynput`
- Shared thread-safe state between modules
- Configurable behavior via `YAML` profiles (gamepad & keyboard)
- Async-based OSC handling + threaded emulation loops
- Xsens MVN bridge

## Requirements

- Python 3.10 or later
- [vgamepad](https://pypi.org/project/vgamepad/)
    - NOTE: VGAMEPAD works with Windows only and currently requires ViGEmBus: https://github.com/ViGEm/ViGEmBus/releases
- [pynput](https://pypi.org/project/pynput/)
- [pyyaml](https://pypi.org/project/PyYAML/)
- [python-osc](https://pypi.org/project/python-osc/)

### Recommended: Use a Virtual Environment

```bash
python -m venv venv
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate
```

Then install required packages:

```bash
pip install -r requirements.txt
```

## Running This Project

### Navigate to the project root

```bash
cd path/to/reality_sdk_python
```

### (Optional) Activate your virtual environment

```bash
Windows:
venv\Scripts\activate
```

```bash
macOS/Linux:
source venv/bin/activate
```

### Run main entry point

NOTE: Before running the main entry point, if you are using a virtual environment, make sure your IDE is configured to use the interpreter in your venv

```bash
python reality_osc_bridge.py
```

## Project Structure

```bash
reality_osc_bridge/
├── core/
│   ├── config.py
│   ├── core_data_classes.py
│   ├── osc_manager.py
│   └── shared_state.py
├── gamepad_emulator/
│   ├── gamepad_emulator.py
│   └── button_mapping.yaml     # ← edit gamepad mapping here
├── haptics/
│   ├── haptics_manager.py
│   ├── haptics_profile.yaml
├── keyboard_emulator/
│   ├── keyboard_emulator.py
│   ├── key_press.py
│   ├── key_wrapper.py
│   ├── key_wrapper_hints.py
│   └── keyboard_mapping.yaml   # ← edit keyboard mapping here
├── mvn/
│   ├── mvn_datagram.py
│   ├── mvn_hand_defaults_simple.json
│   ├── mvn_manager.py
│   ├── mvn_profile.yaml
│   ├── mvn_retarget.py
│   ├── retarget_in_basic_a.json
│   ├── retarget_in_basic_b.json
│   ├── retarget_out_basic_a_mvn.json
│   ├── retarget_out_basic_b_mvn.json
├── reality_osc_bridge.py       # ← Main entry script
├── requirements.txt
└── README.md
```

## License

Copyright 2026 Sensor Holdings Limited

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
