"""Xác thực token và phân quyền theo vai trò (user / guard / admin).

Dùng như FastAPI dependency:

    @router.post("/gate/...")
    async def handler(actor: User = Depends(require_staff)): ...
"""
import base64
import hashlib
import hmac
import json
import logging
import secrets
from datetime import timedelta

from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.time import utc_now
from app.models.models import User, UserRole

logger = logging.getLogger("security")

if settings.SECRET_KEY:
    _SECRET = settings.SECRET_KEY
else:
    _SECRET = "smart-parking-iot-dev-secret-key-2026"
    logger.warning("SECRET_KEY chưa được cấu hình trong .env: đang dùng khóa dev mặc định.")

PBKDF2_ITERATIONS = 100_000


# ---------------------------------------------------------------- mật khẩu
def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"),
                                 PBKDF2_ITERATIONS).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    if "$" not in stored_hash:
        return False
    salt, _ = stored_hash.split("$", 1)
    return hmac.compare_digest(hash_password(password, salt), stored_hash)


# ---------------------------------------------------------------- token
def _sign(raw: str) -> str:
    return hmac.new(_SECRET.encode("utf-8"), raw.encode("ascii"), hashlib.sha256).hexdigest()


def create_access_token(user: User) -> str:
    payload = {
        "sub": user.id,
        "role": user.role,
        "exp": int((utc_now() + timedelta(hours=settings.ACCESS_TOKEN_HOURS)).timestamp()),
    }
    raw = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
    return f"{raw}.{_sign(raw)}"


def decode_access_token(token: str) -> dict:
    try:
        raw, sig = token.split(".", 1)
        if not hmac.compare_digest(sig, _sign(raw)):
            raise ValueError("Invalid signature")
        payload = json.loads(base64.urlsafe_b64decode(raw.encode("ascii")).decode("utf-8"))
        if payload.get("exp", 0) < int(utc_now().timestamp()):
            raise ValueError("Token expired")
        return payload
    except Exception:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn.")


async def user_from_token(db: AsyncSession, token: str) -> User:
    payload = decode_access_token(token)
    user = await db.get(User, payload.get("sub"))
    if not user:
        raise HTTPException(status_code=401, detail="Tài khoản không tồn tại.")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Tài khoản đã bị khóa.")
    return user


def _bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip() or None
    return None


# ---------------------------------------------------------------- dependencies
async def get_current_user(authorization: str | None = Header(default=None),
                           db: AsyncSession = Depends(get_db)) -> User:
    token = _bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Chưa đăng nhập.")
    return await user_from_token(db, token)


async def get_optional_user(authorization: str | None = Header(default=None),
                            db: AsyncSession = Depends(get_db)) -> User | None:
    token = _bearer(authorization)
    return await user_from_token(db, token) if token else None


def require_roles(*roles: UserRole):
    allowed = {r.value for r in roles}

    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(status_code=403, detail="Bạn không có quyền thực hiện thao tác này.")
        return user

    return checker


require_user = require_roles(UserRole.USER)
require_staff = require_roles(UserRole.GUARD, UserRole.ADMIN)
require_admin = require_roles(UserRole.ADMIN)


def is_staff(user: User | None) -> bool:
    return bool(user) and user.role in {UserRole.GUARD.value, UserRole.ADMIN.value}
