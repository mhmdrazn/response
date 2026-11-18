"""Experiments for the thesis (Bab 6): ACS against VNS, and how the plan reacts to its limits.

Experiments that run both solvers use the same seeds, so the runs pair up for a
Wilcoxon signed-rank test:

  main             every scenario, --seeds seeds (30), at the defaults (281 min, 7 min)
  horizon          s2-jun, route duration limit 240 / 281 / 360 / 517 minutes
  dispatch         s2-jun, dispatch reach 5 / 7 / 10 / 15 minutes

and one tunes Hybrid ACS alone, one parameter at a time, the others at default:

  acs_params  s2-jun, --sensitivity-seeds seeds: n_ants 10 / 20 / 30, q0 0.5 / 0.7
              / 0.9, rho 0.10 / 0.15 / 0.30. The all-default setting is run once
              and counted in each of the three groups.

Output in --out (default backend/experiments/):

  metadata.json        commit, Python, OS, CPU, RAM, workers, time limit, date (per session)
  runs.csv             one row per solver run (appended as runs finish)
  summary.csv          mean / std / median / min / max per metric per group
  wilcoxon.csv         ACS vs VNS per metric per group (paired by seed)
  sensitivity.csv      the horizon and dispatch groups of summary.csv
  sensitivity_acs.csv  mean / std / median per ACS parameter setting
  traces/<experiment>_<scenario>_<algorithm>_<param>_<value>_s<seed>.json
                       convergence of every run: iter, t, best_score, best_z, iter_best_score
  best/<scenario>_<algorithm>.json
                       the lowest-score main run per scenario and solver, with its routes

scripts/make_figures.py turns that folder into figures and tables for the book.

Runs are spread over worker processes. Runs that share the CPU slow each other
down and fit fewer iterations into the time limit, so --workers defaults to at
most 6. --resume skips the runs runs.csv already holds.

    python scripts/run_experiments.py                    # everything
    python scripts/run_experiments.py --only main --seeds 5 --time-limit 10
    python scripts/run_experiments.py --resume
    python scripts/run_experiments.py --only acs_params --resume
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import os
import platform
import subprocess
import sys
import time
import warnings
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

SCENARIOS = ["s1-jan", "s2-jun", "s3-nov"]
SENSITIVITY_SCENARIO = "s2-jun"
HORIZONS_MIN = [240, 281, 360, 517]
DISPATCH_MIN = [5, 7, 10, 15]
DEFAULT_HORIZON_MIN = 281
DEFAULT_DISPATCH_MIN = 7
ALGORITHMS = ["acs", "vns"]
EXPERIMENTS = ["main", "horizon", "dispatch", "acs_params"]

# ACS parameter sweep: each varied alone, the rest at the ACSParams defaults.
ACS_SWEEP: dict[str, list[float]] = {
    "n_ants": [10, 20, 30],
    "q0": [0.5, 0.7, 0.9],
    "rho": [0.10, 0.15, 0.30],
}
MAX_SENSIBLE_WORKERS = 6

OUT_DEFAULT = Path(__file__).resolve().parents[1] / "experiments"

RUN_FIELDS = [
    "experiment",
    "scenario",
    "algorithm",
    "seed",
    "horizon_min",
    "dispatch_min",
    "time_limit_s",
    "objective_z",
    "penalty",
    "score",
    "coverage_pct",
    "unserved_l",
    "vehicles_used",
    "vehicles_total",
    "flood_visits",
    "if_visits",
    "excess_visits",
    "total_distance_m",
    "total_time_s",
    "makespan_s",
    "overtime_s",
    "violations",
    "runtime_s",
    "best_found_s",
    "param",
    "param_value",
    "iterations",
]

# Metrics reported per group, and which way is better (for wilcoxon.csv).
SUMMARY_METRICS = [
    "objective_z", "score", "coverage_pct", "total_distance_m", "vehicles_used",
    "if_visits", "excess_visits", "runtime_s", "iterations",
]
TEST_METRICS = {
    "objective_z": "lower", "score": "lower", "coverage_pct": "higher",
    "total_distance_m": "lower", "vehicles_used": "lower", "if_visits": "lower",
    "runtime_s": "lower",
}
ALPHA = 0.05


@dataclass(frozen=True)
class Job:
    experiment: str
    scenario: str
    algorithm: str
    seed: int
    horizon_min: float
    dispatch_min: float
    time_limit_s: float
    # acs_params only: the ACSParams field set away from its default ("default"
    # for the all-default setting), and its value.
    param: str = ""
    param_value: float = 0.0

    def key(self) -> tuple[str, ...]:
        return (
            self.experiment,
            self.scenario,
            self.algorithm,
            str(self.seed),
            _num(self.horizon_min),
            _num(self.dispatch_min),
            self.param,
            _num(self.param_value),
        )

    def setting(self) -> tuple[str, float]:
        """The (name, value) the experiment varies, for file names and reports."""
        if self.experiment == "horizon":
            return "horizon_min", self.horizon_min
        if self.experiment == "dispatch":
            return "dispatch_min", self.dispatch_min
        return (self.param or "default"), self.param_value

    def trace_name(self) -> str:
        name, value = self.setting()
        return (
            f"{self.experiment}_{self.scenario}_{self.algorithm}_{name}_{_num(value)}"
            f"_s{self.seed}.json"
        )


def _num(v: float) -> str:
    return str(int(v)) if float(v).is_integer() else str(v)


# --- One run -------------------------------------------------------------------


def _node(inst, idx: int) -> dict[str, object]:
    """Kind, id and name of a node of the instance, in [depots, floods, outlets] order."""
    if idx < inst.n_depots:
        n = inst.depots[idx]
        return {"type": "depot", "id": str(n["id"]), "name": n.get("name"), "index": idx}
    if idx < inst.n_depots + inst.n_floods:
        n = inst.floods[idx - inst.n_depots]
        return {"type": "flood", "id": str(n["id"]), "name": n.get("deskripsi")}
    n = inst.ifs[idx - inst.n_depots - inst.n_floods]
    name = n.get("waterway_name") or n.get("highway_name")
    return {"type": "if", "id": str(n["id"]), "name": name}


def _clean(v: object) -> object:
    """JSON-safe: NaN and missing values become null."""
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    return v


def _solution(inst, ev) -> list[dict[str, object]]:
    """Routes of the vehicles that pump anything, stop by stop."""
    out: list[dict[str, object]] = []
    for k, r in enumerate(ev.routes):
        if r.n_flood_visits == 0:
            continue
        depot = _node(inst, r.depot_index)
        visits = []
        for v in r.visits:
            if v.node_type == "depot":
                continue
            node = _node(inst, v.node_index)
            visits.append({
                "type": node["type"],
                "id": node["id"],
                "name": _clean(node["name"]),
                "volume_l": round(float(v.volume_pumped), 1),
                "arrival_s": round(float(v.arrival_time), 1),
            })
        out.append({
            "vehicle": f"V{k + 1:02d}-{r.capacity / 1000:g}K",
            "depot_index": r.depot_index,
            "depot_id": depot["id"],
            "depot_name": _clean(depot["name"]),
            "capacity_l": r.capacity,
            "distance_m": round(float(r.total_distance), 1),
            "time_s": round(float(r.total_time), 1),
            "flood_visits": r.n_flood_visits,
            "if_visits": r.n_if_visits,
            "visits": visits,
        })
    return out


def _best_found_s(trace, final_score: float) -> float:
    """Seconds into the run when the final best score was first reached."""
    for score, t in zip(trace.best_score, trace.t):
        if score <= final_score + 1e-6 * max(1.0, abs(final_score)):
            return round(float(t), 3)
    return round(float(trace.t[-1]), 3) if trace.t else 0.0


def run_job(job: Job) -> dict[str, object]:
    """Build the instance as the API does, with the job's limits, and solve it.

    Returns the runs.csv row, plus `_trace` (convergence) and, for main, `_routes`
    (the solution); the main process writes those to their files.
    """
    warnings.filterwarnings("ignore")
    from app.algorithms.acs import ACSParams, HybridACS
    from app.algorithms.evaluator import coverage_ratio, validate_hard_constraints
    from app.algorithms.instance import build_instance
    from app.algorithms.vns import VNS, VNSParams
    from app.data.store import store
    from app.severity.index import compute_severity_index

    bundle = store.get(job.scenario)
    sev = compute_severity_index(bundle.floods, bundle.faskes)
    inst = build_instance(
        depots_df=bundle.depots,
        floods_df=bundle.floods,
        ifs_df=bundle.ifs,
        dist_matrix=bundle.distance_matrix,
        time_matrix=bundle.time_matrix,
        si_values=sev.si_values,
        route_horizon_s=job.horizon_min * 60.0,
        dispatch_limit_s=job.dispatch_min * 60.0,
    )

    t0 = time.perf_counter()
    if job.algorithm == "acs":
        overrides: dict[str, object] = {}
        if job.experiment == "acs_params" and job.param != "default":
            value = job.param_value
            overrides[job.param] = int(value) if job.param == "n_ants" else float(value)
        params = ACSParams(seed=job.seed, time_limit_s=job.time_limit_s, **overrides)
        sol = HybridACS(inst, params).solve()
    else:
        sol = VNS(inst, VNSParams(seed=job.seed, time_limit_s=job.time_limit_s)).solve()
    runtime = time.perf_counter() - t0

    ev = sol.evaluation
    used = [r for r in ev.routes if r.n_flood_visits > 0]
    tr = sol.trace
    row: dict[str, object] = {
        **{k: v for k, v in asdict(job).items()},
        "objective_z": round(ev.objective_z, 3),
        "penalty": round(ev.penalty, 3),
        "score": round(ev.score, 3),
        "coverage_pct": round(coverage_ratio(inst, ev) * 100.0, 4),
        "unserved_l": round(ev.unserved_volume, 1),
        "vehicles_used": len(used),
        "vehicles_total": len(inst.vehicles),
        "flood_visits": ev.total_flood_visits,
        "if_visits": ev.total_if_visits,
        "excess_visits": ev.excess_visits,
        "total_distance_m": round(ev.total_distance, 1),
        "total_time_s": round(ev.total_time, 1),
        "makespan_s": round(max((r.total_time for r in used), default=0.0), 1),
        "overtime_s": round(ev.overtime_s, 1),
        "violations": len(validate_hard_constraints(inst, ev)),
        "runtime_s": round(runtime, 2),
        "best_found_s": _best_found_s(tr, ev.score),
        "iterations": tr.iterations,
    }
    row["_trace"] = [
        {
            "iter": i + 1,
            "t": round(float(t), 3),
            "best_score": _clean(float(b)),
            "best_z": _clean(float(z)),
            "iter_best_score": _clean(float(ib)),
        }
        for i, (t, b, z, ib) in enumerate(zip(tr.t, tr.best_score, tr.best_z, tr.iter_best_score))
    ]
    if job.experiment == "main":
        row["_routes"] = _solution(inst, ev)
    return row


# --- Files beside runs.csv -------------------------------------------------------


def write_trace(out: Path, job: Job, trace: list[dict[str, object]]) -> None:
    folder = out / "traces"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / job.trace_name()).write_text(json.dumps(trace), encoding="utf-8")


BEST_METRICS = [
    "score", "objective_z", "penalty", "coverage_pct", "unserved_l", "vehicles_used",
    "flood_visits", "if_visits", "excess_visits", "total_distance_m", "total_time_s",
    "makespan_s", "runtime_s", "iterations",
]


def keep_if_best(out: Path, row: dict[str, object], routes: list[dict[str, object]]) -> bool:
    """Write the run to best/<scenario>_<algorithm>.json if it beats the one there."""
    folder = out / "best"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{row['scenario']}_{row['algorithm']}.json"
    if path.exists():
        try:
            held = json.loads(path.read_text(encoding="utf-8"))
            if float(held["metrics"]["score"]) <= float(row["score"]):  # type: ignore[arg-type]
                return False
        except (ValueError, KeyError):
            pass  # unreadable: replace it
    payload = {
        "scenario": row["scenario"],
        "algorithm": row["algorithm"],
        "seed": row["seed"],
        "time_limit_s": row["time_limit_s"],
        "metrics": {k: row[k] for k in BEST_METRICS},
        "routes": routes,
    }
    path.write_text(json.dumps(payload, indent=1, ensure_ascii=False), encoding="utf-8")
    return True


def _git(*args: str) -> str:
    try:
        res = subprocess.run(
            ["git", *args], capture_output=True, text=True, timeout=10,
            cwd=Path(__file__).resolve().parent,
        )
        return res.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def _cpu_name() -> str:
    if sys.platform == "win32":
        try:
            import winreg

            key = winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0"
            )
            return str(winreg.QueryValueEx(key, "ProcessorNameString")[0]).strip()
        except OSError:
            pass
    if Path("/proc/cpuinfo").exists():
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if line.startswith("model name"):
                return line.split(":", 1)[1].strip()
    return platform.processor() or platform.machine()


def _ram_gb() -> float | None:
    if sys.platform == "win32":
        import ctypes

        class MemoryStatus(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        stat = MemoryStatus()
        stat.dwLength = ctypes.sizeof(MemoryStatus)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):  # type: ignore[attr-defined]
            return round(stat.ullTotalPhys / 2**30, 1)
        return None
    try:
        return round(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 2**30, 1)
    except (ValueError, OSError, AttributeError):
        return None


def write_metadata(out: Path, args: argparse.Namespace, n_jobs: int) -> None:
    """Record where and how this session ran; a --resume session is added to the list."""
    path = out / "metadata.json"
    sessions: list[dict[str, object]] = []
    if path.exists():
        try:
            sessions = json.loads(path.read_text(encoding="utf-8")).get("sessions", [])
        except ValueError:
            sessions = []
    sessions.append({
        "started_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "commit": _git("rev-parse", "HEAD"),
        "uncommitted_changes": bool(_git("status", "--porcelain", "--untracked-files=no")),
        "python": platform.python_version(),
        "os": f"{platform.system()} {platform.release()} ({platform.version()})",
        "cpu": _cpu_name(),
        "cpu_logical_cores": os.cpu_count(),
        "ram_gb": _ram_gb(),
        "workers": args.workers,
        "time_limit_s": args.time_limit,
        "seeds": args.seeds,
        "sensitivity_seeds": args.sensitivity_seeds,
        "experiments": list(args.only),
        "scenarios": list(args.scenarios),
        "resume": bool(args.resume),
        "runs_planned": n_jobs,
    })
    path.write_text(json.dumps({"sessions": sessions}, indent=2), encoding="utf-8")


# --- Statistics ----------------------------------------------------------------


def _average_ranks(values: np.ndarray) -> np.ndarray:
    """Ranks 1..n, ties sharing the average of the ranks they span."""
    order = np.argsort(values, kind="mergesort")
    ranks = np.empty(len(values), dtype=float)
    sorted_vals = values[order]
    i = 0
    while i < len(values):
        j = i
        while j + 1 < len(values) and sorted_vals[j + 1] == sorted_vals[i]:
            j += 1
        ranks[order[i : j + 1]] = (i + j) / 2.0 + 1.0
        i = j + 1
    return ranks


def _exact_lower_tail(n: int, w: float) -> float:
    """P(W+ <= w) for n untied ranks, from the distribution of rank sums."""
    max_sum = n * (n + 1) // 2
    counts = np.zeros(max_sum + 1, dtype=float)
    counts[0] = 1.0
    for rank in range(1, n + 1):
        counts[rank:] = counts[rank:] + counts[:-rank].copy()
    return float(counts[: int(math.floor(w)) + 1].sum() / 2.0**n)


def wilcoxon_signed_rank(x: np.ndarray, y: np.ndarray) -> dict[str, object]:
    """Two-sided Wilcoxon signed-rank test of paired samples x and y.

    Zero differences are dropped (Wilcoxon's method). With at most 50 pairs and
    no tied |differences| the p-value is exact; otherwise it uses the normal
    approximation with tie and continuity corrections. `effect_r` is |z|/sqrt(n).
    """
    d = np.asarray(x, dtype=float) - np.asarray(y, dtype=float)
    d = d[d != 0.0]
    n = len(d)
    if n == 0:
        return {
            "n": 0, "w_plus": 0.0, "w_minus": 0.0, "statistic": 0.0,
            "z": 0.0, "p_value": 1.0, "effect_r": 0.0, "method": "no differences",
        }
    absd = np.abs(d)
    ranks = _average_ranks(absd)
    w_plus = float(ranks[d > 0].sum())
    w_minus = float(ranks[d < 0].sum())
    stat = min(w_plus, w_minus)

    mean = n * (n + 1) / 4.0
    _, tie_counts = np.unique(absd, return_counts=True)
    var = n * (n + 1) * (2 * n + 1) / 24.0 - float(np.sum(tie_counts**3 - tie_counts)) / 48.0
    diff = w_plus - mean
    z = (diff - 0.5 * np.sign(diff)) / math.sqrt(var) if var > 0 else 0.0
    has_ties = bool(np.any(tie_counts > 1))

    if n <= 50 and not has_ties:
        p = min(1.0, 2.0 * _exact_lower_tail(n, stat))
        method = "exact"
    else:
        p = math.erfc(abs(z) / math.sqrt(2.0))
        method = "normal"
    return {
        "n": n,
        "w_plus": w_plus,
        "w_minus": w_minus,
        "statistic": stat,
        "z": round(float(z), 4),
        "p_value": p,
        "effect_r": round(abs(float(z)) / math.sqrt(n), 4),
        "method": method,
    }


# --- Plan, run, report ---------------------------------------------------------


def plan(args: argparse.Namespace) -> list[Job]:
    jobs: list[Job] = []
    seeds = range(1, args.seeds + 1)
    sens_seeds = range(1, args.sensitivity_seeds + 1)
    tl = args.time_limit
    h0, d0, sc0 = DEFAULT_HORIZON_MIN, DEFAULT_DISPATCH_MIN, SENSITIVITY_SCENARIO
    if "main" in args.only:
        for sc in args.scenarios:
            for algo in ALGORITHMS:
                for s in seeds:
                    jobs.append(Job("main", sc, algo, s, h0, d0, tl))
    if "horizon" in args.only:
        for h in HORIZONS_MIN:
            for algo in ALGORITHMS:
                for s in sens_seeds:
                    jobs.append(Job("horizon", sc0, algo, s, h, d0, tl))
    if "dispatch" in args.only:
        for dm in DISPATCH_MIN:
            for algo in ALGORITHMS:
                for s in sens_seeds:
                    jobs.append(Job("dispatch", sc0, algo, s, h0, dm, tl))
    if "acs_params" in args.only:
        for param, value in acs_settings():
            for s in sens_seeds:
                jobs.append(Job("acs_params", sc0, "acs", s, h0, d0, tl, param, value))
    return jobs


def _acs_defaults() -> dict[str, float]:
    from app.algorithms.acs import ACSParams

    d = ACSParams()
    return {p: float(getattr(d, p)) for p in ACS_SWEEP}


def acs_settings() -> list[tuple[str, float]]:
    """The distinct settings to run: all-default once, then every off-default value."""
    defaults = _acs_defaults()
    out: list[tuple[str, float]] = [("default", 0.0)]
    for param, values in ACS_SWEEP.items():
        out += [(param, float(v)) for v in values if float(v) != defaults[param]]
    return out


def _read_runs(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _param(row: dict[str, str]) -> tuple[str, str]:
    # Rows written before acs_params existed have no such columns.
    value = row.get("param_value") or "0"
    return row.get("param") or "", _num(float(value))


def _run_key(row: dict[str, str]) -> tuple[str, ...]:
    return (
        row["experiment"], row["scenario"], row["algorithm"], str(int(float(row["seed"]))),
        _num(float(row["horizon_min"])), _num(float(row["dispatch_min"])), *_param(row),
    )


def _group_key(row: dict[str, str]) -> tuple[str, ...]:
    return (
        row["experiment"], row["scenario"],
        _num(float(row["horizon_min"])), _num(float(row["dispatch_min"])), *_param(row),
    )


def _setting_label(exp: str, h: str, dm: str, param: str, value: str) -> str:
    if exp == "horizon":
        return f"horizon_min={h}"
    if exp == "dispatch":
        return f"dispatch_min={dm}"
    if param and param != "default":
        return f"{param}={value}"
    return "default"


def _values(rows: list[dict[str, str]], name: str) -> np.ndarray:
    """A column as floats; runs from before the column existed count as missing."""
    out = []
    for r in rows:
        v = r.get(name, "")
        out.append(float(v) if v not in ("", None) else math.nan)
    return np.array(out, dtype=float)


def _five(prefix: str, values: np.ndarray, digits: int) -> dict[str, object]:
    v = values[~np.isnan(values)]
    if len(v) == 0:
        return {f"{prefix}_{k}": "" for k in ("mean", "std", "median", "min", "max")}
    return {
        f"{prefix}_mean": round(float(v.mean()), digits),
        f"{prefix}_std": round(float(v.std(ddof=1)) if len(v) > 1 else 0.0, digits),
        f"{prefix}_median": round(float(np.median(v)), digits),
        f"{prefix}_min": round(float(v.min()), digits),
        f"{prefix}_max": round(float(v.max()), digits),
    }


_DIGITS = {"coverage_pct": 4, "vehicles_used": 2, "if_visits": 2, "excess_visits": 2, "iterations": 2}


def summarise(runs: list[dict[str, str]]) -> list[dict[str, object]]:
    """Mean, std, median, min (best) and max (worst) of every metric, per group and solver."""
    groups: dict[tuple[str, ...], list[dict[str, str]]] = {}
    for r in runs:
        groups.setdefault((*_group_key(r), r["algorithm"]), []).append(r)
    out: list[dict[str, object]] = []
    for (exp, sc, h, dm, param, value, algo), rows in sorted(groups.items()):
        row: dict[str, object] = {
            "experiment": exp, "scenario": sc, "horizon_min": h, "dispatch_min": dm,
            "param": param, "param_value": value,
            "setting": _setting_label(exp, h, dm, param, value),
            "algorithm": algo, "n_runs": len(rows),
        }
        for m in SUMMARY_METRICS:
            row.update(_five(m, _values(rows, m), _DIGITS.get(m, 2)))
        unserved = _values(rows, "unserved_l")
        row["unserved_mean_l"] = round(float(np.nanmean(unserved)), 1)
        row["makespan_mean_min"] = round(float(np.nanmean(_values(rows, "makespan_s"))) / 60.0, 1)
        row["best_found_mean_s"] = (
            round(float(np.nanmean(_values(rows, "best_found_s"))), 2)
            if not np.all(np.isnan(_values(rows, "best_found_s"))) else ""
        )
        row["violations_total"] = int(np.nansum(_values(rows, "violations")))
        out.append(row)
    return out


def compare(runs: list[dict[str, str]]) -> list[dict[str, object]]:
    """Pair ACS and VNS runs by seed within each group and test every metric."""
    by_group: dict[tuple[str, ...], dict[str, dict[int, dict[str, str]]]] = {}
    for r in runs:
        g = by_group.setdefault(_group_key(r), {"acs": {}, "vns": {}})
        g[r["algorithm"]][int(float(r["seed"]))] = r
    out: list[dict[str, object]] = []
    for (exp, sc, h, dm, param, value), algos in sorted(by_group.items()):
        seeds = sorted(set(algos["acs"]) & set(algos["vns"]))
        if not seeds:
            continue
        for metric, direction in TEST_METRICS.items():
            acs = _values([algos["acs"][s] for s in seeds], metric)
            vns = _values([algos["vns"][s] for s in seeds], metric)
            ok = ~(np.isnan(acs) | np.isnan(vns))
            acs, vns = acs[ok], vns[ok]
            if len(acs) == 0:
                continue
            test = wilcoxon_signed_rank(acs, vns)
            d = acs - vns
            md = float(np.median(d))
            lean = md if md != 0 else float(d.mean())
            if test["p_value"] >= ALPHA or lean == 0:  # type: ignore[operator]
                better = "tie"
            elif direction == "lower":
                better = "acs" if lean < 0 else "vns"
            else:
                better = "acs" if lean > 0 else "vns"
            out.append({
                "experiment": exp,
                "scenario": sc,
                "setting": _setting_label(exp, h, dm, param, value),
                "metric": metric,
                "n": len(acs),
                "mean_acs": round(float(acs.mean()), 4),
                "mean_vns": round(float(vns.mean()), 4),
                "median_diff": round(md, 4),
                "W": test["statistic"],
                "p_value": test["p_value"],
                "effect_size_r": test["effect_r"],
                "better": better,
            })
    return out


def _stats(prefix: str, values: np.ndarray, digits: int) -> dict[str, float]:
    return {
        f"{prefix}_mean": round(float(values.mean()), digits),
        f"{prefix}_std": round(float(values.std(ddof=1)) if len(values) > 1 else 0.0, digits),
        f"{prefix}_median": round(float(np.median(values)), digits),
    }


def summarise_acs(runs: list[dict[str, str]]) -> list[dict[str, object]]:
    """One row per parameter value; the all-default runs count in every group."""
    rows = [r for r in runs if r["experiment"] == "acs_params"]
    if not rows:
        return []
    defaults = _acs_defaults()
    out: list[dict[str, object]] = []
    for param, values in ACS_SWEEP.items():
        for v in values:
            v = float(v)
            is_default = v == defaults[param]
            group = [
                r for r in rows
                if (r["param"] == param and float(r["param_value"]) == v)
                or (is_default and r["param"] == "default")
            ]
            if not group:
                continue

            def col(name: str) -> np.ndarray:
                return np.array([float(r[name]) for r in group])

            out.append({
                "param": param,
                "value": _num(v),
                "is_default": is_default,
                "n_runs": len(group),
                **_stats("z", col("objective_z"), 2),
                **_stats("score", col("score"), 2),
                **_stats("coverage_pct", col("coverage_pct"), 3),
                **_stats("vehicles_used", col("vehicles_used"), 2),
                **_stats("iterations", col("iterations"), 2),
            })
    return out


def _migrate_runs(path: Path) -> None:
    """Rewrite runs.csv under the current columns if it was written with older ones."""
    if not path.exists():
        return
    with path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames == RUN_FIELDS:
            return
        old = list(reader)
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=RUN_FIELDS, restval="", extrasaction="ignore")
        w.writeheader()
        w.writerows(old)


def _write(path: Path, rows: list[dict[str, object]]) -> None:
    if not rows:
        return
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def default_workers() -> int:
    return max(1, min(MAX_SENSIBLE_WORKERS, (os.cpu_count() or 2) - 1))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seeds", type=int, default=30, help="seeds per scenario in the main experiment")
    ap.add_argument("--sensitivity-seeds", type=int, default=30,
                    help="seeds per setting in horizon, dispatch and acs_params")
    ap.add_argument("--time-limit", type=float, default=45.0, help="seconds per solver run")
    ap.add_argument("--scenarios", nargs="+", default=SCENARIOS)
    ap.add_argument("--only", nargs="+", default=EXPERIMENTS, choices=EXPERIMENTS)
    ap.add_argument("--workers", type=int, default=default_workers(),
                    help=f"parallel runs (default min({MAX_SENSIBLE_WORKERS}, cpu_count - 1))")
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    ap.add_argument("--resume", action="store_true", help="skip runs already in runs.csv")
    args = ap.parse_args()

    if args.workers > MAX_SENSIBLE_WORKERS:
        print(
            f"WARNING: {args.workers} workers. Runs at the same time share the CPU, so each "
            f"fits fewer iterations into its {args.time_limit:g} s and results are not "
            f"comparable with runs made at {MAX_SENSIBLE_WORKERS} or fewer.",
            flush=True,
        )

    args.out.mkdir(parents=True, exist_ok=True)
    runs_path = args.out / "runs.csv"
    jobs = plan(args)
    if args.resume:
        _migrate_runs(runs_path)
        done = {_run_key(r) for r in _read_runs(runs_path)}
        jobs = [j for j in jobs if j.key() not in done]
    elif runs_path.exists():
        runs_path.unlink()
    write_metadata(args.out, args, len(jobs))

    total = len(jobs)
    est_h = total * args.time_limit / max(args.workers, 1) / 3600
    print(f"{total} runs on {args.workers} workers, about {est_h:.1f} h", flush=True)

    new_file = not runs_path.exists()
    with runs_path.open("a", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=RUN_FIELDS, extrasaction="ignore")
        if new_file:
            writer.writeheader()
        with ProcessPoolExecutor(max_workers=args.workers) as pool:
            futures = {pool.submit(run_job, j): j for j in jobs}
            for i, fut in enumerate(as_completed(futures), 1):
                job = futures[fut]
                try:
                    row = fut.result()
                except Exception as exc:  # noqa: BLE001 - report and keep going
                    print(f"[{i}/{total}] FAILED {job}: {exc}", flush=True)
                    continue
                trace = row.pop("_trace", [])
                routes = row.pop("_routes", None)
                write_trace(args.out, job, trace)  # type: ignore[arg-type]
                best = routes is not None and keep_if_best(args.out, row, routes)  # type: ignore[arg-type]
                writer.writerow(row)
                fh.flush()
                name, value = job.setting()
                setting = f" {name}={_num(value)}" if job.experiment != "main" else ""
                print(
                    f"[{i}/{total}] {job.experiment} {job.scenario} {job.algorithm} "
                    f"seed={job.seed}{setting} "
                    f"Z={row['objective_z']:.0f} cov={row['coverage_pct']:.2f}% "
                    f"it={row['iterations']}{' (best so far)' if best else ''}",
                    flush=True,
                )

    runs = _read_runs(runs_path)
    summary = summarise(runs)
    _write(args.out / "summary.csv", summary)
    _write(args.out / "wilcoxon.csv", compare(runs))
    _write(
        args.out / "sensitivity.csv",
        [r for r in summary if r["experiment"] in ("horizon", "dispatch")],
    )
    _write(args.out / "sensitivity_acs.csv", summarise_acs(runs))
    print(f"results in {args.out}")


if __name__ == "__main__":
    main()
