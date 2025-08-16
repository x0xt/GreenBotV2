# ai/core/text.py
from datetime import datetime
from ai.core.state import is_machine_mode  # Import the state checker

def ts() -> str:
    """Returns the current timestamp as a formatted string."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def log(tag: str, msg: str):
    """Prints a log message to the console, unless in machine mode."""
    if is_machine_mode():
        return  # In machine mode, we print nothing.
    print(f"[{ts()}] [{tag}] {msg}", flush=True)
