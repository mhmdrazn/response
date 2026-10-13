"""Experiments for the thesis: ACS against VNS, and how the plan reacts to its limits.

Three experiments, each run for both solvers with the same seeds so the runs pair
up for a Wilcoxon signed-rank test on Z:

  main       every scenario, 30 seeds, at the defaults (281 min, 7 min)
  horizon    s2-jun, route duration limit 240 / 281 / 360 / 517 minutes
  dispatch   s2-jun, dispatch reach 5 / 7 / 10 / 15 minutes

Results go to CSV in --out (default backend/experiments/):

  runs.csv          one row per solver run (appended as runs finish)
  summary.csv       mean / std / median of Z, coverage and more per group
  wilcoxon.csv      paired test of ACS vs VNS on Z per group
  sensitivity.csv   the horizon and dispatch groups of summary.csv

A full run is long (main alone is 3 x 2 x 30 runs at 45 s), so runs are spread
over worker processes and --resume skips the runs runs.csv already holds.

    python scripts/run_experiments.py                    # everything
    python scripts/run_experiments.py --only main --seeds 5 --time-limit 10
    python scripts/run_experiments.py --resume
"""

from __future__ import annotations

import argparse
import csv
import math
import os
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
    "excess_visits",
    "total_distance_m",
    "total_time_s",
    "makespan_s",
    "overtime_s",
    "violations",
    "runtime_s",
]


@dataclass(frozen=True)
class Job:
    experiment: str
    scenario: str
    algorithm: str
    seed: int
    horizon_min: float
    dispatch_min: float
    time_limit_s: float

    def key(self) -> tuple[str, ...]:
        return (
            self.experiment,
            self.scenario,
            self.algorithm,
            str(self.seed),
            _num(self.horizon_min),
            _num(self.dispatch_min),
        )


def _num(v: float) -> str:
    return str(int(v)) if float(v).is_integer() else str(v)


# --- One run -------------------------------------------------------------------


def run_job(job: Job) -> dict[str, object]:
    """Build the instance as the API does, with the job's limits, and solve it."""
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
        sol = HybridACS(inst, ACSParams(seed=job.seed, time_limit_s=job.time_limit_s)).solve()
    else:
        sol = VNS(inst, VNSParams(seed=job.seed, time_limit_s=job.time_limit_s)).solve()
    runtime = time.perf_counter() - t0

    ev = sol.evaluation
    used = [r for r in ev.routes if r.n_flood_visits > 0]
    return {
        **{k: v for k, v in asdict(job).items()},
        "objective_z": round(ev.objective_z, 3),
        "penalty": round(ev.penalty, 3),
        "score": round(ev.score, 3),
        "coverage_pct": round(coverage_ratio(inst, ev) * 100.0, 4),
        "unserved_l": round(ev.unserved_volume, 1),
        "vehicles_used": len(used),
        "vehicles_total": len(inst.vehicles),
        "flood_visits": ev.total_flood_visits,
        "excess_visits": ev.excess_visits,
        "total_distance_m": round(ev.total_distance, 1),
        "total_time_s": round(ev.total_time, 1),
        "makespan_s": round(max((r.total_time for r in used), default=0.0), 1),
        "overtime_s": round(ev.overtime_s, 1),
        "violations": len(validate_hard_constraints(inst, ev)),
        "runtime_s": round(runtime, 2),
    }


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
    if "main" in args.only:
        for sc in args.scenarios:
            for algo in ALGORITHMS:
                for s in seeds:
                    jobs.append(Job("main", sc, algo, s, DEFAULT_HORIZON_MIN, DEFAULT_DISPATCH_MIN, tl))
    if "horizon" in args.only:
        for h in HORIZONS_MIN:
            for algo in ALGORITHMS:
                for s in sens_seeds:
                    jobs.append(Job("horizon", SENSITIVITY_SCENARIO, algo, s, h, DEFAULT_DISPATCH_MIN, tl))
    if "dispatch" in args.only:
        for dm in DISPATCH_MIN:
            for algo in ALGORITHMS:
                for s in sens_seeds:
                    jobs.append(Job("dispatch", SENSITIVITY_SCENARIO, algo, s, DEFAULT_HORIZON_MIN, dm, tl))
    return jobs


def _read_runs(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _run_key(row: dict[str, str]) -> tuple[str, ...]:
    return (
        row["experiment"], row["scenario"], row["algorithm"], str(int(float(row["seed"]))),
        _num(float(row["horizon_min"])), _num(float(row["dispatch_min"])),
    )


def _group_key(row: dict[str, str]) -> tuple[str, str, str, str]:
    return (
        row["experiment"], row["scenario"],
        _num(float(row["horizon_min"])), _num(float(row["dispatch_min"])),
    )


def summarise(runs: list[dict[str, str]]) -> list[dict[str, object]]:
    groups: dict[tuple[str, ...], list[dict[str, str]]] = {}
    for r in runs:
        groups.setdefault((*_group_key(r), r["algorithm"]), []).append(r)
    out: list[dict[str, object]] = []
    for (exp, sc, h, dm, algo), rows in sorted(groups.items()):
        def col(name: str) -> np.ndarray:
            return np.array([float(r[name]) for r in rows])

        z = col("objective_z")
        out.append({
            "experiment": exp, "scenario": sc, "horizon_min": h, "dispatch_min": dm,
            "algorithm": algo, "n_runs": len(rows),
            "z_mean": round(float(z.mean()), 2),
            "z_std": round(float(z.std(ddof=1)) if len(z) > 1 else 0.0, 2),
            "z_median": round(float(np.median(z)), 2),
            "z_min": round(float(z.min()), 2),
            "z_max": round(float(z.max()), 2),
            "score_mean": round(float(col("score").mean()), 2),
            "coverage_mean_pct": round(float(col("coverage_pct").mean()), 3),
            "coverage_min_pct": round(float(col("coverage_pct").min()), 3),
            "unserved_mean_l": round(float(col("unserved_l").mean()), 1),
            "vehicles_used_mean": round(float(col("vehicles_used").mean()), 2),
            "excess_visits_mean": round(float(col("excess_visits").mean()), 2),
            "makespan_mean_min": round(float(col("makespan_s").mean()) / 60.0, 1),
            "violations_total": int(col("violations").sum()),
            "runtime_mean_s": round(float(col("runtime_s").mean()), 2),
        })
    return out


def compare(runs: list[dict[str, str]]) -> list[dict[str, object]]:
    """Pair ACS and VNS runs by seed within each group and test their Z."""
    by_group: dict[tuple[str, ...], dict[str, dict[int, float]]] = {}
    for r in runs:
        g = by_group.setdefault(_group_key(r), {"acs": {}, "vns": {}})
        g[r["algorithm"]][int(float(r["seed"]))] = float(r["objective_z"])
    out: list[dict[str, object]] = []
    for (exp, sc, h, dm), algos in sorted(by_group.items()):
        seeds = sorted(set(algos["acs"]) & set(algos["vns"]))
        if not seeds:
            continue
        acs = np.array([algos["acs"][s] for s in seeds])
        vns = np.array([algos["vns"][s] for s in seeds])
        test = wilcoxon_signed_rank(acs, vns)
        lower = "acs" if np.median(acs) < np.median(vns) else "vns"
        out.append({
            "experiment": exp, "scenario": sc, "horizon_min": h, "dispatch_min": dm,
            "pairs": len(seeds),
            "acs_z_median": round(float(np.median(acs)), 2),
            "vns_z_median": round(float(np.median(vns)), 2),
            "median_diff_acs_minus_vns": round(float(np.median(acs - vns)), 2),
            "acs_lower_in": int(np.sum(acs < vns)),
            **test,
            "significant_0.05": bool(test["p_value"] < 0.05),
            "lower_z": lower,
        })
    return out


def _write(path: Path, rows: list[dict[str, object]]) -> None:
    if not rows:
        return
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seeds", type=int, default=30, help="seeds per scenario in the main experiment")
    ap.add_argument("--sensitivity-seeds", type=int, default=30, help="seeds per setting in sensitivity runs")
    ap.add_argument("--time-limit", type=float, default=45.0, help="seconds per solver run")
    ap.add_argument("--scenarios", nargs="+", default=SCENARIOS)
    ap.add_argument("--only", nargs="+", default=["main", "horizon", "dispatch"],
                    choices=["main", "horizon", "dispatch"])
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    ap.add_argument("--resume", action="store_true", help="skip runs already in runs.csv")
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    runs_path = args.out / "runs.csv"
    jobs = plan(args)
    if args.resume:
        done = {_run_key(r) for r in _read_runs(runs_path)}
        jobs = [j for j in jobs if j.key() not in done]
    elif runs_path.exists():
        runs_path.unlink()

    total = len(jobs)
    est_h = total * args.time_limit / max(args.workers, 1) / 3600
    print(f"{total} runs on {args.workers} workers, about {est_h:.1f} h", flush=True)

    new_file = not runs_path.exists()
    with runs_path.open("a", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=RUN_FIELDS)
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
                writer.writerow(row)
                fh.flush()
                print(
                    f"[{i}/{total}] {job.experiment} {job.scenario} {job.algorithm} "
                    f"seed={job.seed} h={_num(job.horizon_min)} d={_num(job.dispatch_min)} "
                    f"Z={row['objective_z']:.0f} cov={row['coverage_pct']:.2f}%",
                    flush=True,
                )

    runs = _read_runs(runs_path)
    summary = summarise(runs)
    _write(args.out / "summary.csv", summary)
    _write(args.out / "wilcoxon.csv", compare(runs))
    _write(args.out / "sensitivity.csv", [r for r in summary if r["experiment"] != "main"])
    print(f"results in {args.out}")


if __name__ == "__main__":
    main()
