"""Watch the keyboard for a stop key while a long job runs, on Windows, macOS and Linux."""

from __future__ import annotations

import sys
import threading


class StopKey:
    """Sets `pressed` when one of `keys` is typed. Does nothing without a terminal (piped or
    scheduled runs), where Ctrl+C still works. Use as a context manager; the terminal is put
    back as it was on exit."""

    def __init__(self, keys: str = "qQ") -> None:
        self.keys = keys
        self.pressed = threading.Event()
        self._done = threading.Event()
        self._thread: threading.Thread | None = None
        self._restore = None

    def __enter__(self) -> StopKey:
        if not sys.stdin or not sys.stdin.isatty():
            return self
        if sys.platform == "win32":
            target = self._watch_windows
        else:
            import termios
            import tty

            fd = sys.stdin.fileno()
            old = termios.tcgetattr(fd)
            tty.setcbreak(fd)  # keys arrive one at a time, without Enter
            self._restore = lambda: termios.tcsetattr(fd, termios.TCSADRAIN, old)
            target = self._watch_posix
        self._thread = threading.Thread(target=target, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self._done.set()
        if self._thread:
            self._thread.join(timeout=1)
        if self._restore:
            self._restore()

    def _watch_windows(self) -> None:
        import msvcrt
        import time

        while not self._done.is_set():
            if msvcrt.kbhit() and msvcrt.getwch() in self.keys:
                self.pressed.set()
            time.sleep(0.1)

    def _watch_posix(self) -> None:
        import select

        while not self._done.is_set():
            ready, _, _ = select.select([sys.stdin], [], [], 0.2)
            if ready and sys.stdin.read(1) in self.keys:
                self.pressed.set()
