"""RFC 7807 problem-detail HTTPException builders used by routers."""
from app.api.auth import _problem as auth_problem
from app.api.orders import _problem as orders_problem
from app.api.reviews import _problem as reviews_problem
from app.api.merchant import _problem as merchant_problem


def _check(builder):
    exc = builder(404, "Not Found", "x not found", "/api/v1/x")
    assert exc.status_code == 404
    assert exc.detail["title"] == "Not Found"
    assert exc.detail["status"] == 404
    assert exc.detail["detail"] == "x not found"
    assert exc.detail["instance"] == "/api/v1/x"
    assert exc.detail["type"].startswith("https://shopflow.io/errors/")


def test_auth_problem_shape():
    _check(auth_problem)


def test_orders_problem_shape():
    _check(orders_problem)


def test_reviews_problem_shape():
    _check(reviews_problem)


def test_merchant_problem_shape():
    _check(merchant_problem)


def test_problem_type_slug_lowercases_and_dashes():
    exc = auth_problem(409, "Already Exists", "dup", "/x")
    assert exc.detail["type"] == "https://shopflow.io/errors/already-exists"
