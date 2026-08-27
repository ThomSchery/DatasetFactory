from __future__ import annotations

import uvicorn

from backend.app.config import Settings
from backend.app.main import create_app


def main() -> None:
    """Run the packaged-local composition from the same validated settings as the app."""
    settings = Settings()
    if settings.spa_dir is None:
        raise RuntimeError("DF_SPA_DIR is required in packaged-local mode")
    uvicorn.run(
        create_app(settings),
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
