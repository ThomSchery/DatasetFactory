"""What the Manager hands the Client to render.

The records below are shaped by persistence today. The Client imports them from
here and never from Access, so a router has one place to look and the day a record
needs a shape of its own the change is this module, not eleven routers (TK-016,
TD-025). Re-exporting is a seam, not a copy: it makes the dependency direction
true and lets `test_architecture_boundaries` forbid `api` → `access` outright.
"""

from backend.app.access.desktop import FileKind, FilePickerError, PickedFile
from backend.app.access.status.service import DependencyStatus, SystemStatusSnapshot
from backend.app.access.store.repositories.annotations import StoredAnnotation, StoredFrameReview
from backend.app.access.store.repositories.exports import ExportRecord
from backend.app.access.store.repositories.frames import FramePage, FrameSummary
from backend.app.access.store.repositories.materials import MaterialPage, MaterialRecord
from backend.app.access.store.repositories.profiles import ProfileRecord, ProfileSummaryRecord
from backend.app.access.store.repositories.projects import ProjectRecord
from backend.app.access.store.repositories.runs import RunPage, RunRecord, RunSummaryRecord

__all__ = [
    "DependencyStatus",
    "ExportRecord",
    "FileKind",
    "FilePickerError",
    "FramePage",
    "FrameSummary",
    "MaterialPage",
    "MaterialRecord",
    "PickedFile",
    "ProfileRecord",
    "ProfileSummaryRecord",
    "ProjectRecord",
    "RunPage",
    "RunRecord",
    "RunSummaryRecord",
    "StoredAnnotation",
    "StoredFrameReview",
    "SystemStatusSnapshot",
]
