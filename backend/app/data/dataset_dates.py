"""When each dataset file was last updated, for the "Data diperbarui" line.

A file's own modification time is not usable on a deployment: Vercel stamps
every deployed file with the same fixed date (2018-10-20) and a fresh checkout
stamps them with the checkout time. scripts/stamp_dataset_dates.py records each
file's last commit date with a hash of its content in dataset_dates.json. While
the file still has that content the commit date is used; once it has been edited
(in place locally, or as a saved copy on a read-only host) its own time is.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from app.config import DATA_ROOT, readable_path

STAMPS_PATH = DATA_ROOT / "dataset_dates.json"


def content_hash(path: Path) -> str:
    """Hash of the content with line endings normalised (a Windows checkout has CRLF)."""
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


@lru_cache(maxsize=1)
def _stamps() -> dict[str, dict[str, str]]:
    try:
        return json.loads(STAMPS_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


@lru_cache(maxsize=64)
def _hash_cached(path: str, mtime_ns: int, size: int) -> str:
    return content_hash(Path(path))


def updated_at(deployed: Path) -> str | None:
    """ISO time the dataset at `deployed` (its path in the repo layout) last changed."""
    current = readable_path(deployed)
    if not current.exists():
        return None
    st = current.stat()
    try:
        stamp = _stamps().get(deployed.relative_to(DATA_ROOT).as_posix())
    except ValueError:
        stamp = None
    if stamp and _hash_cached(str(current), st.st_mtime_ns, st.st_size) == stamp.get("sha256"):
        return stamp["updated_at"]
    return datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat()
