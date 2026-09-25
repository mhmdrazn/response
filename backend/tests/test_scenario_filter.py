from app.preprocessing import scenario


def test_date_filter_has_datetime_and_id():
    df = scenario.from_date_range("2025-01-11", "2025-01-12", dedup=True)
    assert 0 < len(df) <= 23
    for col in ("id", "lat", "lon", "depth_cm", "datetime"):
        assert col in df.columns
    # datetime combines date + time (not midnight-only)
    assert df["datetime"].astype(str).str.contains(":").any()


def test_dedup_never_increases_count():
    raw = scenario.from_date_range("2025-01-11", "2025-01-12", dedup=False)
    deduped = scenario.from_date_range("2025-01-11", "2025-01-12", dedup=True)
    assert len(deduped) <= len(raw)
