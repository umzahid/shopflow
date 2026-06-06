from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.models import User, UserRole

bearer_scheme = HTTPBearer(auto_error=False)


def _problem(status_code: int, title: str, detail: str, instance: str) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"type": f"https://shopflow.io/errors/{title.lower().replace(' ', '-')}",
                "title": title, "status": status_code, "detail": detail, "instance": instance},
    )


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        raise _problem(status.HTTP_401_UNAUTHORIZED, "Unauthorized", "Missing or invalid Authorization header", str(request.url.path))

    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError:
        raise _problem(status.HTTP_401_UNAUTHORIZED, "Unauthorized", "Token is invalid or expired", str(request.url.path))

    result = await db.execute(select(User).where(User.id == payload["sub"], User.deleted_at.is_(None)))
    user = result.scalar_one_or_none()
    if not user:
        raise _problem(status.HTTP_401_UNAUTHORIZED, "Unauthorized", "User not found", str(request.url.path))
    return user


def require_role(*roles: UserRole):
    async def _check(
        request: Request,
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.role not in roles:
            raise _problem(
                status.HTTP_403_FORBIDDEN,
                "Forbidden",
                f"This endpoint requires role: {', '.join(r.value for r in roles)}",
                str(request.url.path),
            )
        return current_user
    return _check
