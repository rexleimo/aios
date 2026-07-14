from __future__ import annotations

import re
from pathlib import Path
from typing import Any


SEMVER_PATTERN = re.compile(
    r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)"
    r"(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
)


def on_config(config: Any) -> Any:
    config_path = getattr(config, "config_file_path", None)
    if not config_path:
        raise RuntimeError("MkDocs config path is required to resolve VERSION")

    version_path = Path(config_path).resolve().parent / "VERSION"
    try:
        version = version_path.read_text(encoding="utf-8").strip()
    except OSError as error:
        raise RuntimeError(f"Unable to read {version_path}") from error

    if not SEMVER_PATTERN.fullmatch(version):
        raise RuntimeError(f"Invalid VERSION value: {version!r}")

    config.extra["aios_version"] = version
    return config
