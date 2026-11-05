"""Native "open file" dialog for the local desktop user.

The browser never reveals the full path of a file the user picks, and the
application reads videos and screenshots in place, so the dialog has to be
opened by the local backend. It runs in a short-lived child process: a Tk
dialog inside the server process would need its own UI thread, and a crash or
a hang there would take the API down with it.
"""

from __future__ import annotations

import subprocess
import sys
import threading
from dataclasses import dataclass
from typing import Literal, Protocol

FileKind = Literal["video", "image"]

_FILE_TYPES: dict[FileKind, tuple[tuple[str, str], ...]] = {
    "video": (("Video", "*.mp4 *.mov *.mkv *.webm"), ("All files", "*.*")),
    "image": (("Screenshot", "*.png *.jpg *.jpeg"), ("All files", "*.*")),
}

_DIALOG_SCRIPT = """
import sys
import tkinter
from tkinter import filedialog

root = tkinter.Tk()
root.withdraw()
root.attributes("-topmost", True)
kinds = [tuple(item.split("|", 1)) for item in sys.argv[2:]]
path = filedialog.askopenfilename(title=sys.argv[1], filetypes=kinds)
root.destroy()
sys.stdout.write(path or "")
"""


class FilePickerError(Exception):
    """A typed refusal the API maps onto a stable error code."""

    def __init__(self, code: Literal["file_picker_busy", "file_picker_unavailable"]) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True, slots=True)
class PickedFile:
    """`path` is `None` when the user closed the dialog without choosing."""

    path: str | None


class LocalFilePicker(Protocol):
    def pick(self, kind: FileKind) -> PickedFile: ...


class SystemFilePicker:
    """Opens the operating system dialog; one dialog at a time."""

    def __init__(self, timeout_seconds: int = 900) -> None:
        self._lock = threading.Lock()
        self._timeout_seconds = timeout_seconds

    def pick(self, kind: FileKind) -> PickedFile:
        if not self._lock.acquire(blocking=False):
            raise FilePickerError("file_picker_busy")
        try:
            title = "Choose a video" if kind == "video" else "Choose a screenshot"
            filetypes = [f"{label}|{pattern}" for label, pattern in _FILE_TYPES[kind]]
            try:
                completed = subprocess.run(
                    [sys.executable, "-I", "-c", _DIALOG_SCRIPT, title, *filetypes],
                    capture_output=True,
                    check=False,
                    text=True,
                    encoding="utf-8",
                    timeout=self._timeout_seconds,
                )
            except (OSError, subprocess.TimeoutExpired) as error:
                raise FilePickerError("file_picker_unavailable") from error
            if completed.returncode != 0:
                raise FilePickerError("file_picker_unavailable")
            path = completed.stdout.strip()
            return PickedFile(path or None)
        finally:
            self._lock.release()


class DisabledFilePicker:
    """For headless runs: the UI falls back to typing the path."""

    def pick(self, kind: FileKind) -> PickedFile:
        del kind
        raise FilePickerError("file_picker_unavailable")
