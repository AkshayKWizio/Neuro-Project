from pynput.keyboard import Key, Controller

class KeyPress:
    """
    Provides class-level methods for simulating keyboard keypresses using pynput.
    Supports momentary key taps, holding keys, and releasing individual or all keys.
    """

    keyboard = Controller()
    pressed_keys = set()

    @classmethod
    def momentary(cls, ctrl=False, alt=False, shift=False, key=None):
        """
        Simulates a momentary key press (press + release) with optional modifier keys.

        Args:
            ctrl (bool): Whether to hold and release the Ctrl key.
            alt (bool): Whether to hold and release the Alt key.
            shift (bool): Whether to hold and release the Shift key.
            key (str or Key): The main key to press and release.
        """
        if ctrl:
            cls.keyboard.press(Key.ctrl)
        if alt:
            cls.keyboard.press(Key.alt)
        if shift:
            cls.keyboard.press(Key.shift)

        if key:
            cls.keyboard.press(key)
            cls.keyboard.release(key)

        if ctrl:
            cls.keyboard.release(Key.ctrl)
        if alt:
            cls.keyboard.release(Key.alt)
        if shift:
            cls.keyboard.release(Key.shift)

    @classmethod
    def hold(cls, ctrl=False, alt=False, shift=False, key=None):
        """
        Simulates pressing and holding keys, including modifiers, and tracks them internally.

        Args:
            ctrl (bool): Whether to press and hold the Ctrl key.
            alt (bool): Whether to press and hold the Alt key.
            shift (bool): Whether to press and hold the Shift key.
            key (str or Key): The main key to press and hold.
        """
        if ctrl:
            cls.keyboard.press(Key.ctrl)
            cls.pressed_keys.add(Key.ctrl)
        if alt:
            cls.keyboard.press(Key.alt)
            cls.pressed_keys.add(Key.alt)
        if shift:
            cls.keyboard.press(Key.shift)
            cls.pressed_keys.add(Key.shift)

        if key:
            cls.keyboard.press(key)
            cls.pressed_keys.add(key)

    @classmethod
    def release(cls, ctrl=False, alt=False, shift=False, key=None):
        """
        Releases specified key and/or modifiers if they are currently held.

        Args:
            ctrl (bool): Whether to release the Ctrl key.
            alt (bool): Whether to release the Alt key.
            shift (bool): Whether to release the Shift key.
            key (str or Key): The main key to release.
        """
        if ctrl:
            cls.keyboard.release(Key.ctrl)
            cls.pressed_keys.discard(Key.ctrl)

        if alt:
            cls.keyboard.release(Key.alt)
            cls.pressed_keys.discard(Key.alt)

        if shift:
            cls.keyboard.release(Key.shift)
            cls.pressed_keys.discard(Key.shift)

        if key:
            cls.keyboard.release(key)
            cls.pressed_keys.discard(key)

    @classmethod
    def release_all(cls):
        """
        Releases all keys that are currently held.
        Clears the internal pressed_keys set.
        """
        for key in list(cls.pressed_keys):
            cls.keyboard.release(key)
            cls.pressed_keys.remove(key)
