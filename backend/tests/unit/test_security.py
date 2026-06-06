import pytest
from jose import JWTError
from app.core.security import (
    hash_password, verify_password,
    create_access_token, decode_access_token,
    create_refresh_token, hash_token, refresh_token_redis_key,
)


def test_password_hash_and_verify():
    pw = "MySecureP@ss1"
    hashed = hash_password(pw)
    assert hashed != pw
    assert verify_password(pw, hashed)


def test_wrong_password_fails():
    hashed = hash_password("correct")
    assert not verify_password("wrong", hashed)


def test_create_and_decode_access_token():
    token = create_access_token("user-123", "customer")
    payload = decode_access_token(token)
    assert payload["sub"] == "user-123"
    assert payload["role"] == "customer"
    assert payload["type"] == "access"


def test_tampered_token_rejected():
    token = create_access_token("user-123", "customer")
    tampered = token[:-5] + "XXXXX"
    with pytest.raises(JWTError):
        decode_access_token(tampered)


def test_refresh_token_is_unique():
    t1 = create_refresh_token()
    t2 = create_refresh_token()
    assert t1 != t2
    assert len(t1) > 32


def test_refresh_token_hash_is_deterministic():
    token = create_refresh_token()
    assert hash_token(token) == hash_token(token)


def test_refresh_redis_key_format():
    token = create_refresh_token()
    key = refresh_token_redis_key(token)
    assert key.startswith("refresh:")
    assert len(key) > 10
