"""Record when each dataset file last changed, for the "Data diperbarui" line.

A deployment cannot tell this from the files: Vercel stamps every deployed file
with the same fixed date (2018-10-20), and a fresh checkout stamps them with the
checkout time. So the date of each file's last commit is written down here, with
the file's hash, in app/data/files/dataset_dates.json. The API uses that date
while the file is still the committed one, and the file's own time once it has
been edited in the app.

Run after changing a dataset file and committing it, then commit the JSON too:

    python scripts/stamp_dataset_dates.py
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import DATA_ROOT, SHARED_FILES, SCENARIOS_DIR  # noqa: E402
from app.data.dataset_dates import content_hash  # noqa: E402

OUT = DATA_ROOT / "dataset_dates.json"


def files() -> list[Path]:
    out = list(SHARED_FILES.values())
    out += sorted(SCENARIOS_DIR.glob("*/floods.csv"))
    return [p for p in out if p.exists()]


def commit_date(path: Path) -> str | None:
    res = subprocess.run(
        ["git", "log", "-1", "--format=%cI", "--", str(path)],
        capture_output=True, text=True, cwd=path.parent,
    )
    return res.stdout.strip() or None


def main() -> None:
    stamps: dict[str, dict[str, str]] = {}
    for path in files():
        date = commit_date(path)
        if date is None:
            continue  # never committed (the blank canvas): its own time is right
        rel = path.relative_to(DATA_ROOT).as_posix()
        stamps[rel] = {
            "updated_at": date,
            "sha256": content_hash(path),
        }
        print(f"{rel}: {date}")
    OUT.write_text(json.dumps(stamps, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
