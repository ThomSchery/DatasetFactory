from __future__ import annotations

from backend.app.access.desktop import FileKind, LocalFilePicker, PickedFile


class LocalFileUseCases:
    """Opening the operator's native file dialog.

    The browser never reveals the full path of a file the operator picks, and the
    application reads videos and screenshots in place, so the local backend opens
    the dialog. The router asks the Manager; only the Manager knows the desktop.
    """

    def __init__(self, picker: LocalFilePicker) -> None:
        self._picker = picker

    def pick(self, kind: FileKind) -> PickedFile:
        return self._picker.pick(kind)
