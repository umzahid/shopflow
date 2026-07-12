"""Provision an admin account for the authenticated ZAP scan.

Admin is a privileged role and is intentionally NOT self-registerable through
the public /auth/register endpoint (see app/api/auth.py). Authenticated
security scanning still needs an admin session, so this seeds one directly in
the DB — the "out-of-band provisioning" path admins are meant to use.

Run inside the backend container so it shares the app + DB config:

    docker exec -e PYTHONPATH=/app shopflow-backend-1 \
        python /app/security/seed_scan_admin.py

Credentials come from ZAP_ADMIN_EMAIL / ZAP_ADMIN_PASSWORD (security/zap-scan.sh
sets them). Idempotent: a no-op if the account already exists.
"""
import asyncio
import os

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.models import User, UserRole

# NB: a real (non special-use) TLD — Pydantic's EmailStr rejects .local/.test,
# which would then 422 at login even though the row inserts fine here.
EMAIL = os.environ.get("ZAP_ADMIN_EMAIL", "zap-scan-admin@e.com")
PASSWORD = os.environ.get("ZAP_ADMIN_PASSWORD", "Zap-Sc4n-Admin!123")


async def main() -> None:
    async with AsyncSessionLocal() as db:
        existing = (
            await db.execute(select(User).where(User.email == EMAIL))
        ).scalar_one_or_none()
        if existing:
            print(f"scan admin already exists ({existing.role.value})")
            return
        db.add(User(email=EMAIL, password_hash=hash_password(PASSWORD), role=UserRole.admin))
        await db.commit()
        print(f"created scan admin: {EMAIL}")


if __name__ == "__main__":
    asyncio.run(main())
