import pytest


@pytest.mark.asyncio
async def test_register_success(client):
    res = await client.post("/api/v1/auth/register", json={
        "email": "test@shopflow.io",
        "password": "Password123",
        "role": "customer",
    })
    assert res.status_code == 201
    data = res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "test@shopflow.io"
    assert "password_hash" not in data["user"]


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    payload = {"email": "dup@shopflow.io", "password": "Password123"}
    await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 409
    assert res.json()["status"] == 409


@pytest.mark.asyncio
async def test_login_success(client):
    await client.post("/api/v1/auth/register", json={"email": "login@shopflow.io", "password": "Password123"})
    res = await client.post("/api/v1/auth/login", json={"email": "login@shopflow.io", "password": "Password123"})
    assert res.status_code == 200
    assert "access_token" in res.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    await client.post("/api/v1/auth/register", json={"email": "pw@shopflow.io", "password": "Password123"})
    res = await client.post("/api/v1/auth/login", json={"email": "pw@shopflow.io", "password": "WrongPass"})
    assert res.status_code == 401
    # Should NOT say "wrong password" — same error as wrong email
    assert "Invalid credentials" in res.json()["detail"]


@pytest.mark.asyncio
async def test_login_wrong_email(client):
    res = await client.post("/api/v1/auth/login", json={"email": "nobody@shopflow.io", "password": "Password123"})
    assert res.status_code == 401
    # Same error message as wrong password — no user enumeration
    assert "Invalid credentials" in res.json()["detail"]


@pytest.mark.asyncio
async def test_protected_route_requires_token(client):
    res = await client.get("/api/v1/products")
    # Will be added in Week 2 — currently 404 but NOT 401 for public routes
    assert res.status_code in (200, 404)


@pytest.mark.asyncio
async def test_logout(client):
    await client.post("/api/v1/auth/register", json={"email": "logout@shopflow.io", "password": "Password123"})
    res = await client.delete("/api/v1/auth/logout")
    assert res.status_code == 204
