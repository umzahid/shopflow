"""Public category taxonomy — read-only list that powers storefront filters."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Category
from app.schemas.product import CategoryResponse

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryResponse])
async def list_categories(db: AsyncSession = Depends(get_db)) -> list[CategoryResponse]:
    rows = (await db.execute(select(Category).order_by(Category.name))).scalars().all()
    return [CategoryResponse.model_validate(c) for c in rows]
