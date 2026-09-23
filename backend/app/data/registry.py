"""Scenario registry: read scenarios/manifest.json and resolve scenario ids.

If the manifest is missing, fall back to any scenario directory that has a
floods.csv, so the API still works before the manifest is written.
"""

from __future__ import annotations

import json

from app.config import MANIFEST_PATH, SCENARIOS_DIR, scenario_dir
from app.models.scenario import ScenarioMeta


def load_manifest() -> tuple[list[ScenarioMeta], str]:
    if MANIFEST_PATH.exists():
        raw = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        metas = [ScenarioMeta(**s) for s in raw.get("scenarios", [])]
        default = raw.get("default") or (metas[0].id if metas else "")
        return metas, default

    metas = []
    if SCENARIOS_DIR.exists():
        for d in sorted(p for p in SCENARIOS_DIR.iterdir() if p.is_dir()):
            if (d / "floods.csv").exists():
                metas.append(ScenarioMeta(id=d.name, name=d.name))
    return metas, (metas[0].id if metas else "")


def scenario_ids() -> list[str]:
    metas, _ = load_manifest()
    return [m.id for m in metas]


def default_id() -> str:
    return load_manifest()[1]


def resolve(scenario_id: str | None) -> str:
    """Return a concrete scenario id: the default when none is given, or the
    given id if it exists. Raises KeyError for an unknown id."""
    metas, default = load_manifest()
    ids = {m.id for m in metas}

    if not scenario_id:
        if not default:
            raise KeyError("no scenarios configured")
        return default
    if scenario_id in ids or (scenario_dir(scenario_id) / "floods.csv").exists():
        return scenario_id
    raise KeyError(scenario_id)
