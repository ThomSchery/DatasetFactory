from __future__ import annotations

import subprocess
import threading
from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend.app.access.desktop import (
    DisabledFilePicker,
    FileKind,
    FilePickerError,
    PickedFile,
    SystemFilePicker,
)
from backend.app.composition import CompositionRoot
from backend.app.main import create_app


class RecordingPicker:
    def __init__(self, answer: str | None) -> None:
        self.answer = answer
        self.kinds: list[FileKind] = []

    def pick(self, kind: FileKind) -> PickedFile:
        self.kinds.append(kind)
        return PickedFile(self.answer)


def test_pick_returns_the_chosen_path_for_the_requested_kind(
    composition: CompositionRoot,
) -> None:
    picker = RecordingPicker("D:/videos/session.mp4")
    composition.file_picker = picker
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        response = client.post("/api/v1/local-files/pick", json={"kind": "video"})

    assert response.status_code == 200
    assert response.json() == {"path": "D:/videos/session.mp4"}
    assert picker.kinds == ["video"]


def test_cancelled_dialog_is_a_clean_empty_answer(composition: CompositionRoot) -> None:
    composition.file_picker = RecordingPicker(None)
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        response = client.post("/api/v1/local-files/pick", json={"kind": "image"})

    assert response.status_code == 200
    assert response.json() == {"path": None}


def test_unknown_kind_is_a_validation_error(composition: CompositionRoot) -> None:
    composition.file_picker = RecordingPicker(None)
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        response = client.post("/api/v1/local-files/pick", json={"kind": "archive"})

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"


def test_unavailable_dialog_maps_to_503(composition: CompositionRoot) -> None:
    composition.file_picker = DisabledFilePicker()
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        response = client.post("/api/v1/local-files/pick", json={"kind": "video"})

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "file_picker_unavailable"


def test_open_dialog_does_not_block_other_requests(composition: CompositionRoot) -> None:
    release = threading.Event()
    entered = threading.Event()

    class BlockingPicker:
        def pick(self, kind: FileKind) -> PickedFile:
            del kind
            entered.set()
            release.wait(timeout=10)
            return PickedFile(None)

    composition.file_picker = BlockingPicker()
    with TestClient(create_app(composition.settings, composition=composition)) as client:
        results: list[int] = []
        worker = threading.Thread(
            target=lambda: results.append(
                client.post("/api/v1/local-files/pick", json={"kind": "video"}).status_code
            )
        )
        worker.start()
        assert entered.wait(timeout=10)
        health = client.get("/api/v1/health")
        release.set()
        worker.join(timeout=10)

    assert health.status_code == 200
    assert results == [200]


def test_system_picker_runs_one_dialog_at_a_time(monkeypatch: pytest.MonkeyPatch) -> None:
    started = threading.Event()
    release = threading.Event()
    calls: list[list[str]] = []

    def fake_run(arguments: list[str], **_: Any) -> subprocess.CompletedProcess[str]:
        calls.append(arguments)
        started.set()
        release.wait(timeout=10)
        return subprocess.CompletedProcess(arguments, 0, stdout="D:/clip.mp4\n", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    picker = SystemFilePicker()
    answers: list[PickedFile] = []
    first = threading.Thread(target=lambda: answers.append(picker.pick("video")))
    first.start()
    assert started.wait(timeout=10)
    with pytest.raises(FilePickerError) as busy:
        picker.pick("video")
    release.set()
    first.join(timeout=10)

    assert busy.value.code == "file_picker_busy"
    assert answers == [PickedFile("D:/clip.mp4")]
    assert "-I" in calls[0]


def test_system_picker_reports_cancel_and_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    outcomes = iter(
        [
            subprocess.CompletedProcess([], 0, stdout="", stderr=""),
            subprocess.CompletedProcess([], 1, stdout="", stderr="no display"),
        ]
    )
    monkeypatch.setattr(subprocess, "run", lambda *_args, **_kwargs: next(outcomes))
    picker = SystemFilePicker()

    assert picker.pick("image") == PickedFile(None)
    with pytest.raises(FilePickerError) as failure:
        picker.pick("image")
    assert failure.value.code == "file_picker_unavailable"
