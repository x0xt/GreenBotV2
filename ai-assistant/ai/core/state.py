# ai/core/state.py
# This file holds the shared application state.

_MACHINE_MODE = False

def set_machine_mode(enabled: bool):
    """Sets the machine-friendly output mode for the entire application."""
    global _MACHINE_MODE
    _MACHINE_MODE = enabled

def is_machine_mode() -> bool:
    """Checks if machine-friendly output mode is enabled."""
    return _MACHINE_MODE
