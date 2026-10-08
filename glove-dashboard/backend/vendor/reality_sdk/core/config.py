REALITY_SDK_PYTHON_VERSION = "0.4.1"

from enum import IntEnum
from typing import List

# General Options -------------------------------------------------------------
DEBUG_LOGGING = False


# Joint Names -----------------------------------------------------------------
JOINT_NAMES: List[str] = [
    "palm", 
    "hand",

    "thumb_cmc", 
    "thumb_mcp", 
    "thumb_dip", 
    "thumb_tip",

    "index_cmc", 
    "index_mcp", 
    "index_pip", 
    "index_dip", 
    "index_tip",

    "middle_cmc", 
    "middle_mcp", 
    "middle_pip", 
    "middle_dip", 
    "middle_tip",

    "ring_cmc", 
    "ring_mcp", 
    "ring_pip", 
    "ring_dip", 
    "ring_tip",

    "pinky_cmc", 
    "pinky_mcp", 
    "pinky_pip", 
    "pinky_dip", 
    "pinky_tip"
]

class JointName(IntEnum):
    PALM = 0
    HAND = 1
    THUMB_CMC = 2
    THUMB_MCP = 3
    THUMB_DIP = 4
    THUMB_TIP = 5
    INDEX_CMC = 6
    INDEX_MCP = 7
    INDEX_PIP = 8
    INDEX_DIP = 9
    INDEX_TIP = 10
    MIDDLE_CMC = 11
    MIDDLE_MCP = 12
    MIDDLE_PIP = 13
    MIDDLE_DIP = 14
    MIDDLE_TIP = 15
    RING_CMC = 16
    RING_MCP = 17
    RING_PIP = 18
    RING_DIP = 19
    RING_TIP = 20
    PINKY_CMC = 21
    PINKY_MCP = 22
    PINKY_PIP = 23
    PINKY_DIP = 24
    PINKY_TIP = 25

JOINT_INDEX_TO_NAME = {index: name for index, name in enumerate(JOINT_NAMES)}
JOINT_NAME_TO_INDEX = {name: index for index, name in JOINT_INDEX_TO_NAME.items()}


# Enumerations ----------------------------------------------------------------
class HANDEDNESS:
    UNKNOWN = 0
    LEFT = 1
    RIGHT = 2
    BOTH = 3

class ControllerButton(IntEnum):
    """Valid mappings for gesture calibration."""
    UNKNOWN = 0
    IDLE = 1
    BUTTON_1 = 2
    BUTTON_2 = 3
    TRIGGER = 4
    GRIP = 5
    MENU = 6
  
    
# OSC Configuration -----------------------------------------------------------
STRETCHSENSE_OSC_VERSION = 1
OSC_RECEIVE_PORT = 9002
OSC_SEND_PORT = 9003


# Controller Denoising --------------------------------------------------------
FLOAT_DENOISE_THRESHOLD = 0.001
