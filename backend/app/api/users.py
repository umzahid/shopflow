"""Customer account: profile, saved addresses, and own reviews.

All endpoints are scoped to the authenticated user (`/users/me/...`); a user
can only ever see or mutate their own records.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import hash_password, verify_password
from app.models.models import Address, Product, Review, User
from app.schemas.account import (
    AddressCreate,
    AddressResponse,
    AddressUpdate,
    MyReviewResponse,
    ProfileUpdate,
)
from app.schemas.auth import UserResponse

router = APIRouter(prefix="/users", tags=["account"])


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


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: ProfileUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.email and body.email != current_user.email:
        clash = (
            await db.execute(
                select(User).where(User.email == body.email, User.id != current_user.id)
            )
        ).scalar_one_or_none()
        if clash:
            raise _problem(status.HTTP_409_CONFLICT, "Conflict", "Email already in use", request.url.path)
        current_user.email = body.email

    if body.new_password:
        if not body.current_password or not verify_password(
            body.current_password, current_user.password_hash
        ):
            raise _problem(
                status.HTTP_400_BAD_REQUEST,
                "Bad Request",
                "Current password is incorrect",
                request.url.path,
            )
        current_user.password_hash = hash_password(body.new_password)

    await db.flush()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)


# ── Saved addresses ─────────────────────────────────────────────────────────

async def _clear_other_defaults(db: AsyncSession, user_id: str, keep_id: str | None) -> None:
    rows = (
        await db.execute(select(Address).where(Address.user_id == user_id, Address.is_default.is_(True)))
    ).scalars().all()
    for a in rows:
        if a.id != keep_id:
            a.is_default = False


@router.get("/me/addresses", response_model=list[AddressResponse])
async def list_addresses(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(Address).where(Address.user_id == current_user.id).order_by(Address.created_at)
        )
    ).scalars().all()
    return [AddressResponse.model_validate(a) for a in rows]


@router.post("/me/addresses", response_model=AddressResponse, status_code=status.HTTP_201_CREATED)
async def create_address(
    body: AddressCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    address = Address(user_id=current_user.id, **body.model_dump())
    db.add(address)
    await db.flush()
    if address.is_default:
        await _clear_other_defaults(db, current_user.id, address.id)
    await db.refresh(address)
    return AddressResponse.model_validate(address)


async def _owned_address(db: AsyncSession, address_id: str, user: User, path: str) -> Address:
    address = (
        await db.execute(select(Address).where(Address.id == address_id))
    ).scalar_one_or_none()
    if not address or address.user_id != user.id:
        raise _problem(status.HTTP_404_NOT_FOUND, "Not Found", "Address not found", path)
    return address


@router.patch("/me/addresses/{address_id}", response_model=AddressResponse)
async def update_address(
    address_id: str,
    body: AddressUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    address = await _owned_address(db, address_id, current_user, request.url.path)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(address, field, value)
    await db.flush()
    if address.is_default:
        await _clear_other_defaults(db, current_user.id, address.id)
    await db.refresh(address)
    return AddressResponse.model_validate(address)


@router.delete("/me/addresses/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_address(
    address_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    address = await _owned_address(db, address_id, current_user, request.url.path)
    await db.delete(address)


# ── Own reviews ─────────────────────────────────────────────────────────────

@router.get("/me/reviews", response_model=list[MyReviewResponse])
async def my_reviews(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(Review, Product.title)
            .join(Product, Product.id == Review.product_id)
            .where(Review.customer_id == current_user.id)
            .order_by(Review.created_at.desc())
        )
    ).all()
    return [
        MyReviewResponse(
            id=r.id,
            product_id=r.product_id,
            product_title=title,
            rating=r.rating,
            body=r.body,
            created_at=r.created_at,
        )
        for r, title in rows
    ]
