from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from backend.app.access.media.image import ReferenceImageProbe
from backend.app.access.media.probe import FfprobeMediaProbe, ProcessTreeRunner
from backend.app.access.media.processing import MediaProcessingAccess
from backend.app.access.ocr import (
    OcrEngine,
    TesseractOcrEngine,
    TesseractProcessRunner,
    TesseractRuntimeIdentity,
)
from backend.app.access.status.service import (
    ResourceProbe,
    SystemResourceProbe,
    SystemStatusAccess,
    TesseractDependencyProbe,
)
from backend.app.access.store.database import Database
from backend.app.access.store.migrations import SchemaUpgradeBlockedError, upgrade_database
from backend.app.access.store.reconciliation import ExportReconciler, ReferenceAssetReconciler
from backend.app.access.store.reference_assets import ReferenceAssetStore
from backend.app.access.store.repositories.annotations import AnnotationRepository
from backend.app.access.store.repositories.assets import AssetRepository
from backend.app.access.store.repositories.checkpoints import CheckpointRepository
from backend.app.access.store.repositories.exports import ExportRepository
from backend.app.access.store.repositories.frames import FrameRepository
from backend.app.access.store.repositories.materials import MaterialRepository
from backend.app.access.store.repositories.profiles import ProfileRepository
from backend.app.access.store.repositories.projects import ProjectRepository
from backend.app.access.store.repositories.runs import RunRepository
from backend.app.access.store.repository import ProjectStore
from backend.app.access.store.workspace import Workspace
from backend.app.config import Settings
from backend.app.engines.coco import CocoExportEngine
from backend.app.engines.definition import DatasetDefinitionEngine
from backend.app.engines.review import AnnotationReviewEngine
from backend.app.logging import close_json_logging, configure_json_logging
from backend.app.managers.workflow.dashboard_use_cases import DashboardUseCases
from backend.app.managers.workflow.export_use_cases import ExportUseCases
from backend.app.managers.workflow.manager import DatasetWorkflow
from backend.app.managers.workflow.material_use_cases import (
    DiskSpaceReader,
    MaterialProbe,
    MaterialUseCases,
    SystemDiskSpaceReader,
)
from backend.app.managers.workflow.profile_use_cases import ProfileUseCases
from backend.app.managers.workflow.recovery import WorkflowRecovery
from backend.app.managers.workflow.review_use_cases import ReviewUseCases
from backend.app.managers.workflow.worker import WorkflowWorker


@dataclass
class CompositionRoot:
    settings: Settings
    workspace: Workspace
    database: Database
    project_store: ProjectStore
    system_status: SystemStatusAccess
    media_processing: MediaProcessingAccess
    ocr_engine: OcrEngine
    profile_use_cases: ProfileUseCases
    material_use_cases: MaterialUseCases
    review_use_cases: ReviewUseCases
    export_use_cases: ExportUseCases
    dashboard_use_cases: DashboardUseCases
    dataset_workflow: DatasetWorkflow
    logger: logging.Logger
    log_path: Path

    def close(self) -> None:
        self.export_use_cases.shutdown()
        self.dataset_workflow.shutdown()
        self.database.dispose()
        close_json_logging(self.logger, self.log_path)


def build_composition(
    settings: Settings,
    *,
    resource_probe: ResourceProbe | None = None,
    media_probe: MaterialProbe | None = None,
    disk_space: DiskSpaceReader | None = None,
    ocr_engine: OcrEngine | None = None,
) -> CompositionRoot:
    """Build the local application graph after filesystem and schema initialization."""
    workspace = Workspace(settings.workspace_dir, settings.cache_dir)
    workspace.prepare()
    log_path = workspace.resolve_relpath("logs/app.jsonl")
    logger = configure_json_logging(log_path, settings.log_level)
    try:
        upgrade_database(settings)
    except SchemaUpgradeBlockedError as error:
        # A refused migration is a controlled startup outcome, not a crash: log the
        # remediation path before the typed error reaches the caller.
        logger.error(
            "schema_upgrade_blocked",
            extra={"error_code": error.code, "remediation": str(error)},
        )
        raise

    database = Database(settings.database_url)
    reconciliation = ReferenceAssetReconciler(database, workspace).reconcile()
    logger.info(
        "reference_asset_reconciliation_completed",
        extra={
            "removed_temporary": reconciliation.removed_temporary,
            "removed_orphaned": reconciliation.removed_orphaned,
            "marked_missing": reconciliation.marked_missing,
            "marked_ready": reconciliation.marked_ready,
        },
    )
    export_reconciliation = ExportReconciler(database, workspace).reconcile()
    logger.info(
        "export_reconciliation_completed",
        extra={
            "removed_temporary": export_reconciliation.removed_temporary,
            "removed_final": export_reconciliation.removed_final,
            "failed_interrupted": export_reconciliation.failed_interrupted,
        },
    )
    project_store = ProjectStore(database, workspace)
    projects = ProjectRepository(database, workspace)
    profiles = ProfileRepository(database)
    assets = AssetRepository(database, workspace)
    materials = MaterialRepository(database)
    profile_use_cases = ProfileUseCases(
        DatasetDefinitionEngine(),
        ReferenceImageProbe(),
        projects,
        profiles,
        assets,
        ReferenceAssetStore(workspace),
    )
    active_media_probe = media_probe or FfprobeMediaProbe(
        settings.ffprobe_path,
        settings.ffprobe_timeout_seconds,
        ProcessTreeRunner(),
    )
    material_use_cases = MaterialUseCases(
        active_media_probe,
        disk_space or SystemDiskSpaceReader(),
        workspace.root,
        projects,
        materials,
    )
    active_resource_probe = resource_probe or SystemResourceProbe()
    tesseract_identity = TesseractRuntimeIdentity(
        executable=settings.tesseract_path,
        model=settings.tesseract_model_path,
        expected_version=settings.tesseract_version,
        expected_runtime_sha256=settings.tesseract_runtime_sha256,
        expected_model_sha256=settings.tesseract_model_sha256,
    )
    status = SystemStatusAccess(
        database,
        workspace,
        settings,
        active_resource_probe,
        TesseractDependencyProbe(
            tesseract_identity,
            active_resource_probe,
            timeout_seconds=settings.tesseract_timeout_seconds,
        ),
    )
    media_processing = MediaProcessingAccess(
        workspace,
        settings.ffmpeg_path,
        settings.frame_extraction_timeout_seconds,
        ProcessTreeRunner(),
    )
    active_ocr_engine = ocr_engine or TesseractOcrEngine(
        workspace,
        tesseract_identity,
        settings.tesseract_timeout_seconds,
        TesseractProcessRunner(),
    )
    runs = RunRepository(database)
    frames = FrameRepository(database)
    checkpoints = CheckpointRepository(database, workspace)
    review_use_cases = ReviewUseCases(
        AnnotationReviewEngine(),
        AnnotationRepository(database),
        workspace,
    )
    export_use_cases = ExportUseCases(
        CocoExportEngine(),
        ExportRepository(database, workspace),
        logger,
    )
    dashboard_use_cases = DashboardUseCases(projects, profiles, runs, frames, status)
    workflow_recovery = WorkflowRecovery(runs, checkpoints)
    workflow_worker = WorkflowWorker(
        runs,
        frames,
        checkpoints,
        workflow_recovery,
        media_processing,
        active_ocr_engine,
        DatasetDefinitionEngine(),
        logger,
    )
    dataset_workflow = DatasetWorkflow(
        runs,
        frames,
        workflow_recovery,
        workflow_worker,
        active_ocr_engine,
    )
    recovery_result = dataset_workflow.recover_startup()
    logger.info(
        "workflow_recovery_completed",
        extra={
            "paused_runs": recovery_result.paused_runs,
            "invalidated_frames": recovery_result.invalidated_frames,
            "skipped_reviewed_frames": recovery_result.skipped_reviewed_frames,
        },
    )
    return CompositionRoot(
        settings,
        workspace,
        database,
        project_store,
        status,
        media_processing,
        active_ocr_engine,
        profile_use_cases,
        material_use_cases,
        review_use_cases,
        export_use_cases,
        dashboard_use_cases,
        dataset_workflow,
        logger,
        log_path,
    )
