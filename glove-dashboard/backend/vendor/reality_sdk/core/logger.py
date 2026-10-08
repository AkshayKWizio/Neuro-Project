from enum import IntEnum


class LogLevel(IntEnum):
    ALL = 0
    WARNING = 1
    ERROR = 2
    NONE = 3


class _Logger:
    def __init__(self):
        self._level = LogLevel.ALL

    def set_level(self, level: LogLevel) -> None:
        self._level = level

    def info(self, message: str) -> None:
        """Print informational messages. Only shown at LogLevel.ALL."""
        if self._level <= LogLevel.ALL:
            print(message)

    def warning(self, message: str) -> None:
        """Print warning messages. Shown at LogLevel.ALL or LogLevel.WARNING."""
        if self._level <= LogLevel.WARNING:
            print(f"[WARNING] {message}")

    def error(self, message: str) -> None:
        """Print error messages. Shown at any level except LogLevel.NONE."""
        if self._level <= LogLevel.ERROR:
            print(f"[ERROR] {message}")


Logger = _Logger()
