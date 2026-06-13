"""Pydantic schema validation."""
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.auth import UserCreate, UserLogin
from app.schemas.cart import CartItemAdd, CartItemUpdate
from app.schemas.order import CheckoutRequest, OrderStatusUpdate, ShippingAddress
from app.schemas.product import ProductCreate, ProductUpdate
from app.schemas.review import RatingHistogram, ReviewCreate, ReviewUpdate
from app.models.models import OrderStatus, ProductStatus, UserRole


# ── Auth schemas ────────────────────────────────────────────────────────────

def test_user_create_rejects_short_password():
    with pytest.raises(ValidationError):
        UserCreate(email="u@e.com", password="short")


def test_user_create_accepts_long_password():
    u = UserCreate(email="u@e.com", password="longenough!")
    assert u.role == UserRole.customer  # default


def test_user_create_invalid_email():
    with pytest.raises(ValidationError):
        UserCreate(email="not-an-email", password="Password123")


def test_user_create_merchant_role():
    u = UserCreate(email="m@e.com", password="Password123", role=UserRole.merchant)
    assert u.role == UserRole.merchant


def test_user_login_requires_email_format():
    with pytest.raises(ValidationError):
        UserLogin(email="not-email", password="x")


# ── Product schemas ─────────────────────────────────────────────────────────

def test_product_create_rejects_negative_price():
    with pytest.raises(ValidationError):
        ProductCreate(title="x", price=Decimal("-1"))


def test_product_create_rejects_negative_stock():
    with pytest.raises(ValidationError):
        ProductCreate(title="x", price=Decimal("5"), stock_qty=-1)


def test_product_create_requires_title():
    with pytest.raises(ValidationError):
        ProductCreate(title="", price=Decimal("1"))


def test_product_create_defaults_to_draft():
    p = ProductCreate(title="OK", price=Decimal("1.00"))
    assert p.status == ProductStatus.draft


def test_product_update_all_optional():
    # PATCH should accept empty body
    ProductUpdate()


# ── Cart schemas ────────────────────────────────────────────────────────────

def test_cart_item_add_rejects_zero_qty():
    with pytest.raises(ValidationError):
        CartItemAdd(product_id="00000000-0000-0000-0000-000000000000", qty=0)


def test_cart_item_add_rejects_negative_qty():
    with pytest.raises(ValidationError):
        CartItemAdd(product_id="00000000-0000-0000-0000-000000000000", qty=-1)


def test_cart_item_update_allows_zero_to_remove():
    item = CartItemUpdate(qty=0)
    assert item.qty == 0


# ── Order schemas ───────────────────────────────────────────────────────────

def test_shipping_address_requires_country():
    with pytest.raises(ValidationError):
        ShippingAddress(line1="a", city="c", postal_code="1")


def test_checkout_request_coupon_optional():
    req = CheckoutRequest(
        shipping_address=ShippingAddress(line1="a", city="c", postal_code="1", country="PK")
    )
    assert req.coupon_code is None


def test_order_status_update_rejects_invalid_status():
    with pytest.raises(ValidationError):
        OrderStatusUpdate(status="not_a_status")


def test_order_status_update_accepts_shipped():
    upd = OrderStatusUpdate(status="shipped")
    assert upd.status == OrderStatus.shipped


# ── Review schemas ──────────────────────────────────────────────────────────

def test_review_create_rating_below_min():
    with pytest.raises(ValidationError):
        ReviewCreate(rating=0)


def test_review_create_rating_above_max():
    with pytest.raises(ValidationError):
        ReviewCreate(rating=6)


def test_review_create_body_optional():
    r = ReviewCreate(rating=4)
    assert r.body is None


def test_review_update_all_optional():
    ReviewUpdate()


def test_review_update_rating_validated():
    with pytest.raises(ValidationError):
        ReviewUpdate(rating=99)


def test_rating_histogram_defaults_zero():
    h = RatingHistogram()
    assert h.total == 0
    assert h.average == 0.0
