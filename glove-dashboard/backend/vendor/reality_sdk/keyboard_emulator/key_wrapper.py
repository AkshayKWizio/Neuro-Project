from functools import partial
from pynput.keyboard import Key
from keyboard_emulator.key_press import KeyPress

import os
from pathlib import Path

class KeyWrapper:
    """
    Dynamically generates keypress functions for all supported key combinations.

    The KeyWrapper class provides methods to initialize and register combinations of
    modifier keys (Ctrl, Alt, Shift) with standard, special, punctuation, numpad,
    function, and media keys. It dynamically creates callable `KeyPress` functions for
    momentary press, hold, and release actions.

    These dynamically generated methods are used to drive virtual keyboard inputs
    and are also exported to a type hinting file for IDE support.
    """

    @classmethod
    def create_key_function(cls, action, ctrl=False, alt=False, shift=False, key=None):
        """
        Create a partial function for a specific key action and modifier combination.

        Args:
            action (str): One of 'momentary', 'hold', or 'release'.
            ctrl (bool): Whether Ctrl modifier is active.
            alt (bool): Whether Alt modifier is active.
            shift (bool): Whether Shift modifier is active.
            key: The key to apply the action to.

        Returns:
            functools.partial: Partially bound KeyPress method.
        """
        action_func = getattr(KeyPress, action)
        return partial(action_func, ctrl=ctrl, alt=alt, shift=shift, key=key)

    @classmethod
    def initialize_key_functions(cls):
        """
        Initializes all valid key combinations by dynamically generating methods.

        Registers combinations of:
            - Alphanumeric characters
            - Punctuation
            - Special keys (e.g., Enter, Tab, Arrows)
            - Function keys (F1–F12)
            - Numpad keys
            - Media keys
            - Modifiers alone
        """
        punctuation_keys = {
            'exclamation': ('1', True),
            'at': ('2', True),
            'hash': ('3', True),
            'dollar': ('4', True),
            'percent': ('5', True),
            'caret': ('6', True),
            'ampersand': ('7', True),
            'asterisk': ('8', True),
            'left_parenthesis': ('9', True),
            'right_parenthesis': ('0', True),
            'underscore': ('-', True),
            'plus': ('=', True),
            'colon': (';', True),
            'double_quote': ("'", True),
            'less_than': (',', True),
            'greater_than': ('.', True),
            'question': ('/', True),
            'pipe': ('\\', True),
            'tilde': ('`', True)
        }
        for name, (key, shift) in punctuation_keys.items():
            cls.generate_functions_for_combinations(key, name, force_shift=shift, limit_combinations=True)

        for key in "abcdefghijklmnopqrstuvwxyz0123456789":
            cls.generate_functions_for_combinations(key)

        special_keys = {
            "space": " ",
            "enter": Key.enter, "tab": Key.tab, "esc": Key.esc,
            "backspace": Key.backspace, "delete": Key.delete,
            "home": Key.home, "end": Key.end,
            "page_up": Key.page_up, "page_down": Key.page_down,
            "left": Key.left, "right": Key.right,
            "up": Key.up, "down": Key.down
        }
        for name, key in special_keys.items():
            cls.generate_functions_for_combinations(key, name)

        for i in range(1, 13):
            cls.generate_functions_for_combinations(getattr(Key, f"f{i}"), f"f{i}")

        numpad_keys = {
            "num_lock": Key.num_lock,
            "numpad_0": '0', "numpad_1": '1', "numpad_2": '2',
            "numpad_3": '3', "numpad_4": '4', "numpad_5": '5',
            "numpad_6": '6', "numpad_7": '7', "numpad_8": '8',
            "numpad_9": '9',
            "numpad_add": '+', "numpad_subtract": '-', "numpad_multiply": '*', "numpad_divide": '/'
        }
        for name, key in numpad_keys.items():
            cls.generate_functions_for_combinations(key, name)

        media_keys = {
            "media_play_pause": Key.media_play_pause,
            "media_volume_mute": Key.media_volume_mute,
            "media_volume_down": Key.media_volume_down,
            "media_volume_up": Key.media_volume_up
        }
        for name, key in media_keys.items():
            cls.generate_functions_for_combinations(key, name, limit_combinations=True)

        modifiers = {
            "ctrl": Key.ctrl, "alt": Key.alt, "shift": Key.shift
        }
        for name, key in modifiers.items():
            cls.generate_functions_for_combinations(key, name, limit_combinations=True)

    @classmethod
    def generate_functions_for_combinations(cls, key, base_name=None, force_shift=False, limit_combinations=False):
        """
        Generate all valid modifier combinations for a given key.

        Args:
            key: Key to bind.
            base_name (str): Optional custom name for the key function.
            force_shift (bool): Forces Shift modifier to always be True.
            limit_combinations (bool): If True, generate only unmodified versions.
        """
        combinations = [
            (False, False, False), (True, False, False), (False, True, False),
            (False, False, True), (True, True, False), (True, False, True),
            (False, True, True), (True, True, True)
        ]
        base = base_name or key

        for ctrl, alt, shift in combinations:
            if limit_combinations and (ctrl or alt or shift):
                continue

            actual_shift = shift or force_shift
            suffix = "_".join(filter(None, [
                "ctrl" if ctrl else "",
                "alt" if alt else "",
                "shift" if actual_shift and not limit_combinations else ""
            ]))
            suffix = f"_{suffix}" if suffix else ""

            for prefix, action in [("press", "momentary"), ("hold", "hold"), ("release", "release")]:
                func_name = f"{prefix}_{base}{suffix}"
                setattr(cls, func_name, cls.create_key_function(action, ctrl, alt, actual_shift, key))

    @classmethod
    def list_generated_functions(cls):
        """
        Return a sorted list of all dynamically generated function names.

        Returns:
            List[str]: Function names like 'press_a', 'hold_b_ctrl', etc.
        """
        return sorted([
            name for name in dir(cls)
            if name.startswith("press_") or name.startswith("hold_") or name.startswith("release_")
        ])

    @classmethod
    def generate_hints_file(cls, output_file="keyboard_emulator/key_wrapper_hints.py"):
        """
        Generate a Python hints file for all KeyWrapper functions.

        This method writes a statically typed class `KeyWrapperHints` with `Callable` attributes
        for each key combination generated by `KeyWrapper`. The file is auto-generated and intended
        for IDE support (e.g., auto-completion and type checking), not for execution.

        Args:
            output_file (str): Path to the file where hints will be written.
        """
        cls.initialize_key_functions()
        func_names = cls.list_generated_functions()

        with open(output_file, "w") as f:
            f.write(
                '"""\n'
                'key_wrapper_hints.py\n\n'
                'Auto-generated type hint container for all supported key combinations in the KeyWrapper system.\n\n'
                'This file provides a static structure with callable attributes representing\n'
                'all valid `KeyWrapper` functions. It is intended solely for IDE auto-completion\n'
                'and type checking, and should not be executed directly or modified by hand.\n\n'
                'Note:\n'
                '    This file is regenerated automatically as part of the key mapping generation process.\n'
                '    Manual changes will be overwritten.\n\n'
                'Attributes:\n'
                '    Each attribute is a `Callable` corresponding to a `KeyWrapper` key combination\n'
                '    (e.g., hold_0, hold_0_alt_shift, hold_a_ctrl, etc.).\n'
                '"""\n\n'
            )
            f.write("from typing import Callable\n\n")
            f.write("class KeyWrapperHints:\n")
            for name in func_names:
                f.write(f"    {name}: Callable\n")

        print(f"[KeyWrapper] Hints file written to {output_file}")
