from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.redis import get_redis
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    refresh_token_redis_key,
    verify_password,
)
from app.models.models import User
from app.schemas.auth import Token, UserCreate, UserLogin, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])

_REFRESH_COOKIE = "refresh_token"
_REFRESH_TTL = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 86400  # seconds


def _problem(status_code: int, title: str, detail: str, instance: str) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={
            "type": f"https://shopflow.io/errors/{title.lower().replace(' ', '-')}",
            "title": title,
            "status": status_code,
            "detail": detail,
            "instance": instance,
        },
    )


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=_REFRESH_TTL,
        domain=settings.COOKIE_DOMAIN,
        path="/api/v1/auth",
    )


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(
    body: UserCreate,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(User).where(User.email == body.email, User.deleted_at.is_(None)))
    if existing.scalar_one_or_none():
        raise _problem(status.HTTP_409_CONFLICT, "Conflict", "Email already registered", request.url.path)

    user = User(email=body.email, password_hash=hash_password(body.password), role=body.role)
    db.add(user)
    await db.flush()  # get user.id without commit

    redis = await get_redis()
    refresh_token = create_refresh_token()
    await redis.setex(refresh_token_redis_key(refresh_token), _REFRESH_TTL, user.id)

    _set_refresh_cookie(response, refresh_token)
    access_token = create_access_token(user.id, user.role.value)
    return Token(access_token=access_token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=Token)
async def login(
    body: UserLogin,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == body.email, User.deleted_at.is_(None)))
    user = result.scalar_one_or_none()

    # Same error for wrong email OR wrong password — prevents user enumeration
    if not user or not verify_password(body.password, user.password_hash):
        raise _problem(status.HTTP_401_UNAUTHORIZED, "Unauthorized", "Invalid credentials", request.url.path)

    redis = await get_redis()
    refresh_token = create_refresh_token()
    await redis.setex(refresh_token_redis_key(refresh_token), _REFRESH_TTL, user.id)

    _set_refresh_cookie(response, refresh_token)
    access_token = create_access_token(user.id, user.role.value)
    return Token(access_token=access_token, user=UserResponse.model_validate(user))


@router.post("/refresh", response_model=Token)
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    token = request.cookies.get(_REFRESH_COOKIE)
    if not token:
        raise _problem(status.HTTP_401_UNAUTHORIZED, "Unauthorized", "Refresh token missing", request.url.path)

    redis = await get_redis()
    redis_key = refresh_token_redis_key(token)
    user_id = await redis.get(redis_key)

    if not user_id:
        # Token not found — could be expired or replayed after rotation
        raise _problem(status.HTTP_401_UNAUTHORIZED, "Unauthorized", "Refresh token invalid or expired", request.url.path)

    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at.is_(None)))
    user = result.scalar_one_or_none()
    if not user:
        await redis.delete(redis_key)
        raise _problem(status.HTTP_401_UNAUTHORIZED, "Unauthorized", "User not found", request.url.path)

    # Rotation: delete old token, issue new one
    await redis.delete(redis_key)
    new_refresh_token = create_refresh_token()
    await redis.setex(refresh_token_redis_key(new_refresh_token), _REFRESH_TTL, user.id)

    _set_refresh_cookie(response, new_refresh_token)
    access_token = create_access_token(user.id, user.role.value)
    return Token(access_token=access_token, user=UserResponse.model_validate(user))


@router.delete("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response):
    token = request.cookies.get(_REFRESH_COOKIE)
    if token:
        redis = await get_redis()
        await redis.delete(refresh_token_redis_key(token))

    response.delete_cookie(key=_REFRESH_COOKIE, path="/api/v1/auth")
