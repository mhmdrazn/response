"""Offline preprocessing pipeline (build-time, not request-time).

Extracted from notebooks 3-7 into pure, reusable functions. Used by
scripts/build_scenario.py to produce a scenario data bundle
(floods.csv + distance/time matrices), and later by the intake enrichment
service (Phase 1.5) to enrich a single new flood point on demand.
"""
