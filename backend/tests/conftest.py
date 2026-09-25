import pytest
from fastapi.testclient import TestClient

from app.data.store import store
from app.main import app


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture()
def s2():
    """The default scenario bundle (34 flood points)."""
    return store.get("s2-jun")
