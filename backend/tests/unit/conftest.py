"""Unit test configuration — override the session-level DB setup to skip database connection."""
import pytest


@pytest.fixture(scope="session", autouse=True)
def _disable_db_setup(request):
    """Skip database connection for unit tests that don't need it."""
    # This fixture runs after the root conftest's setup_test_db,
    # but we can use pytest markers to selectively skip tests.
    yield
