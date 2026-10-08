from core.config import STRETCHSENSE_OSC_VERSION

class OSCKey:
    # Receive -----------------------------------------------------------------
    
    # Receive - Streaming
    KINEMATIC = "kinematic"
    SLIDERS = "sliders"
    TIPS = "tips"
    CONTROLLER = "controller"
    ORIENTATION = "orientation"

    # Receive - State/configuration
    TRACKER_OFFSET_CALIBRATION = "tracker_offset_calibration"
    SET_TRACKER_OFFSET = "set_tracker_offset"
    SET_TRACKER_SOURCE = "set_tracker_source"
    SET_TRACKER_LOCATION = "set_tracker_location"
    ENABLE_BUTTON_PASSTHROUGH = "enable_button_passthrough"
    
    DEVICE_INFO = "device_info"
    
    CALIB_GESTURE_STATE = "calib_gesture_state"
    CALIB_ARTICULATION_STATE = "calib_articulation_state"
    CALIB_JOYSTICK_STATE = "calib_joystick_state"
    CALIB_DPAD_STATE = "calib_dpad_state"


    # Send --------------------------------------------------------------------

    # Send - Haptics
    HAPTICS = "haptics"

    # Send - Device Info
    DEVICE_INFO_REQUEST = "device_info_request"

    # Send - Configuration
    APPLICATION_NAME = "application_name"
    
    # Send - LED
    LED_DEFAULT_SET = "led_default_set"
    LED_CURRENT_SET = "led_current_set"
    
    # Send — Calibration commands (output from Python)
    CALIB_GESTURE_ADD = "calib_gesture_add"
    CALIB_GESTURE_DELETE = "calib_gesture_delete"
    CALIB_GESTURE_RESET_ALL = "calib_gesture_reset_all"

    CALIB_ARTICULATION_ADD = "calib_articulation_add"
    CALIB_ARTICULATION_DELETE = "calib_articulation_delete"
    CALIB_ARTICULATION_RESET_ALL = "calib_articulation_reset_all"

    CALIB_JOYSTICK_ADD = "calib_joystick_add"      # not yet supported by receiver
    CALIB_JOYSTICK_DELETE = "calib_joystick_delete"  # not yet supported by receiver
    CALIB_JOYSTICK_RESET_ALL = "calib_joystick_reset_all"  # not yet supported by receiver

    CALIB_DPAD_ADD = "calib_dpad_add"              # not yet supported by receiver
    CALIB_DPAD_DELETE = "calib_dpad_delete"        # not yet supported by receiver
    CALIB_DPAD_RESET_ALL = "calib_dpad_reset_all"  # not yet supported by receiver

    # Send - IMU
    CALIB_IMU_TARE = "calib_imu_tare"
    CALIB_IMU_TARE_DELETE = "calib_imu_tare_delete"
    CALIB_GYROSCOPE_ADD = "calib_gyroscope_add"
    CALIB_GYROSCOPE_DELETE = "calib_gyroscope_delete"
    CALIB_ACCELEROMETER_ADD = "calib_accelerometer_add"
    CALIB_ACCELEROMETER_DELETE = "calib_accelerometer_delete"


OSC_ADDRESSES_V1 = {
    # Incoming streaming/state
    OSCKey.CONTROLLER:                  "/v1/controller_input/all",
    OSCKey.ORIENTATION:                 "/v1/orientation/all",
    OSCKey.KINEMATIC:                   "/v1/animation/kinematic/all",
    OSCKey.SLIDERS:                     "/v1/animation/sliders/all",
    OSCKey.TIPS:                        "/v1/animation/tips/all",
    OSCKey.TRACKER_OFFSET_CALIBRATION:  "/v1/config/tracker_offset_calibration/all",
    OSCKey.SET_TRACKER_OFFSET:          "/v1/config/set_tracker_offset/all",
    OSCKey.SET_TRACKER_SOURCE:          "/v1/config/set_tracker_source/all",
    OSCKey.SET_TRACKER_LOCATION:        "/v1/config/set_tracker_location/all",
    OSCKey.ENABLE_BUTTON_PASSTHROUGH:   "/v1/config/enable_button_passthrough/all",
    OSCKey.DEVICE_INFO:                 "/v1/device_info/all",

    # Outgoing commands / controls
    OSCKey.HAPTICS:                     "/v1/output/haptic",
    OSCKey.APPLICATION_NAME:            "/v1/config/application_name",
    OSCKey.LED_DEFAULT_SET:             "/v1/config/led/default/set",
    OSCKey.LED_CURRENT_SET:             "/v1/config/led/current/set",

    # Send — Calibration commands
    OSCKey.CALIB_GESTURE_ADD:           "/v1/calibration/gesture/add",
    OSCKey.CALIB_GESTURE_DELETE:        "/v1/calibration/gesture/delete",
    OSCKey.CALIB_GESTURE_RESET_ALL:     "/v1/calibration/gesture/reset_all",

    OSCKey.CALIB_ARTICULATION_ADD:      "/v1/calibration/articulation/add",
    OSCKey.CALIB_ARTICULATION_DELETE:   "/v1/calibration/articulation/delete",
    OSCKey.CALIB_ARTICULATION_RESET_ALL: "/v1/calibration/articulation/reset_all",

    OSCKey.CALIB_JOYSTICK_ADD:          "/v1/calibration/joystick/add",
    OSCKey.CALIB_JOYSTICK_DELETE:       "/v1/calibration/joystick/delete",
    OSCKey.CALIB_JOYSTICK_RESET_ALL:    "/v1/calibration/joystick/reset_all",

    OSCKey.CALIB_DPAD_ADD:              "/v1/calibration/dpad/add",
    OSCKey.CALIB_DPAD_DELETE:           "/v1/calibration/dpad/delete",
    OSCKey.CALIB_DPAD_RESET_ALL:        "/v1/calibration/dpad/reset_all",

    # IMU / sensor calibration commands
    OSCKey.CALIB_IMU_TARE:              "/v1/calibration/imu/tare/add",
    OSCKey.CALIB_IMU_TARE_DELETE:       "/v1/calibration/imu/tare/delete",
    OSCKey.CALIB_GYROSCOPE_ADD:         "/v1/calibration/imu/gyroscope/add",
    OSCKey.CALIB_GYROSCOPE_DELETE:      "/v1/calibration/imu/gyroscope/delete",
    OSCKey.CALIB_ACCELEROMETER_ADD:     "/v1/calibration/imu/accelerometer/add",
    OSCKey.CALIB_ACCELEROMETER_DELETE:  "/v1/calibration/imu/accelerometer/delete",

    # Incoming calibration state messages
    OSCKey.CALIB_GESTURE_STATE:         "/v1/calibration/gesture/state",
    OSCKey.CALIB_ARTICULATION_STATE:    "/v1/calibration/articulation/state",
    OSCKey.CALIB_JOYSTICK_STATE:        "/v1/calibration/joystick/state",
    OSCKey.CALIB_DPAD_STATE:            "/v1/calibration/dpad/state",
}

# Coming soon in future updates. Draft only. Not yet supported
# OSC_ADDRESSES_V2 = {
#     # Incoming streaming/state
#     OSCKey.CONTROLLER:                  "/v2/controller/out",
#     OSCKey.ORIENTATION:                 "/v2/orientation/out",
#     OSCKey.KINEMATIC:                   "/v2/animation/out",
#     OSCKey.SLIDERS:                     "/v2/sliders/out",    

#     OSCKey.TRACKER_OFFSET_CALIBRATION:  "/v2/config/out/tracker_offset_calibration",
#     OSCKey.SET_TRACKER_OFFSET:          "/v2/config/out/set_tracker_offset",
#     OSCKey.SET_TRACKER_SOURCE:          "/v2/config/out/set_tracker_source",
#     OSCKey.SET_TRACKER_LOCATION:        "/v2/config/out/set_tracker_location",
#     OSCKey.ENABLE_BUTTON_PASSTHROUGH:   "/v2/config/out/enable_button_passthrough",
#     OSCKey.DEVICE_INFO:                 "/v2/config/out/device_info",

#     # Outgoing commands / controls
#     OSCKey.HAPTICS:                     "/v2/haptic/in",
#     OSCKey.APPLICATION_NAME:            "/v2/config/in/application_name",
#     OSCKey.LED_DEFAULT_SET:             "/v2/config/in/led/default/set",
#     OSCKey.LED_CURRENT_SET:             "/v2/config/in/led/current/set",

#     # Send — Calibration commands
#     OSCKey.CALIB_GESTURE_ADD:           "/v2/calibration/in/gesture/add",
#     OSCKey.CALIB_GESTURE_DELETE:        "/v2/calibration/in/gesture/delete",
#     OSCKey.CALIB_GESTURE_RESET_ALL:     "/v2/calibration/in/gesture/reset_all",

#     OSCKey.CALIB_ARTICULATION_ADD:      "/v2/calibration/in/articulation/add",
#     OSCKey.CALIB_ARTICULATION_DELETE:   "/v2/calibration/in/articulation/delete",
#     OSCKey.CALIB_ARTICULATION_RESET_ALL: "/v2/calibration/in/articulation/reset_all",

#     OSCKey.CALIB_JOYSTICK_ADD:          "/v2/calibration/in/joystick/add",
#     OSCKey.CALIB_JOYSTICK_DELETE:       "/v2/calibration/in/joystick/delete",
#     OSCKey.CALIB_JOYSTICK_RESET_ALL:    "/v2/calibration/in/joystick/reset_all",

#     OSCKey.CALIB_DPAD_ADD:              "/v2/calibration/in/dpad/add",
#     OSCKey.CALIB_DPAD_DELETE:           "/v2/calibration/in/dpad/delete",
#     OSCKey.CALIB_DPAD_RESET_ALL:        "/v2/calibration/in/dpad/reset_all",

#     # IMU / sensor calibration commands
#     OSCKey.CALIB_IMU_TARE:              "/v2/calibration/in/imu/tare/add",
#     OSCKey.CALIB_IMU_TARE_DELETE:       "/v2/calibration/in/imu/tare/delete",
#     OSCKey.CALIB_GYROSCOPE_ADD:         "/v2/calibration/in/imu/gyroscope/add",
#     OSCKey.CALIB_GYROSCOPE_DELETE:      "/v2/calibration/in/imu/gyroscope/delete",
#     OSCKey.CALIB_ACCELEROMETER_ADD:     "/v2/calibration/in/imu/accelerometer/add",
#     OSCKey.CALIB_ACCELEROMETER_DELETE:  "/v2/calibration/in/imu/accelerometer/delete",

#     # Incoming calibration state messages
#     OSCKey.CALIB_GESTURE_STATE:         "/v2/calibration/out/gesture/state",
#     OSCKey.CALIB_ARTICULATION_STATE:    "/v2/calibration/out/articulation/state",
#     OSCKey.CALIB_JOYSTICK_STATE:        "/v2/calibration/out/joystick/state",
#     OSCKey.CALIB_DPAD_STATE:            "/v2/calibration/out/dpad/state",
# }

OSC_ADDRESS_VERSIONS = {
    1: OSC_ADDRESSES_V1,
    # 2: OSC_ADDRESSES_V2,  # Coming in future updates
}


OSC_ADDRESSES = OSC_ADDRESS_VERSIONS.get(STRETCHSENSE_OSC_VERSION, OSC_ADDRESSES_V1)
