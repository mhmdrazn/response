"""The 'Data diperbarui' date: the commit date while unedited, the file's time once edited."""

import json
import os

from app.data import dataset_dates


def _setup(tmp_path, monkeypatch, content: bytes):
    data = tmp_path / "files"
    (data / "shared").mkdir(parents=True)
    f = data / "shared" / "depo.csv"
    f.write_bytes(content)
    stamps = data / "dataset_dates.json"
    stamps.write_text(json.dumps({
        "shared/depo.csv": {
            "updated_at": "2026-10-13T19:42:27+07:00",
            # recorded from the LF version of the same content
            "sha256": dataset_dates.content_hash(f) if b"\r" not in content else None,
        }
    }), encoding="utf-8")
    monkeypatch.setattr(dataset_dates, "DATA_ROOT", data)
    monkeypatch.setattr(dataset_dates, "STAMPS_PATH", stamps)
    monkeypatch.setattr(dataset_dates, "readable_path", lambda p: p)
    dataset_dates._stamps.cache_clear()
    dataset_dates._hash_cached.cache_clear()
    # A deployment stamps files with a fixed old time.
    os.utime(f, (1540025160, 1540025160))  # 2018-10-20
    return f


def test_unedited_file_reports_its_commit_date(tmp_path, monkeypatch):
    f = _setup(tmp_path, monkeypatch, b"id,name\n1,a\n")
    assert dataset_dates.updated_at(f) == "2026-10-13T19:42:27+07:00"


def test_crlf_checkout_still_matches_the_recorded_content(tmp_path, monkeypatch):
    f = _setup(tmp_path, monkeypatch, b"id,name\n1,a\n")
    f.write_bytes(b"id,name\r\n1,a\r\n")
    os.utime(f, (1540025160, 1540025160))
    dataset_dates._hash_cached.cache_clear()
    assert dataset_dates.updated_at(f) == "2026-10-13T19:42:27+07:00"


def test_edited_file_reports_its_own_time(tmp_path, monkeypatch):
    f = _setup(tmp_path, monkeypatch, b"id,name\n1,a\n")
    f.write_bytes(b"id,name\n1,b\n")
    os.utime(f, (1793000000, 1793000000))
    assert dataset_dates.updated_at(f).startswith("2026-10-26")
