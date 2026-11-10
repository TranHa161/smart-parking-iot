import base64
import hashlib
import hmac
import json
import re
import secrets
from datetime import timedelta
from fastapi import HTTPException, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models.models import User, UserRole

TOKEN_SECRET = "smart-parking-iot-secret-key-2026"
PBKDF2_ITERATIONS = 100_000


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PBKDF2_ITERATIONS,
    ).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    if "$" not in stored_hash:
        return False
    salt, _ = stored_hash.split("$", 1)
    expected = hash_password(password, salt)
    return hmac.compare_digest(expected, stored_hash)


def create_access_token(user: User) -> str:
    payload = {
        "sub": user.id,
        "email": user.email,
        "role": user.role,
        "exp": int((utc_now() + timedelta(days=7)).timestamp()),
    }
    raw = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
    sig = hmac.new(TOKEN_SECRET.encode("utf-8"), raw.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{raw}.{sig}"


def decode_access_token(token: str) -> dict:
    try:
        raw, sig = token.split(".", 1)
        expected_sig = hmac.new(
            TOKEN_SECRET.encode("utf-8"), raw.encode("ascii"), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            raise ValueError("Invalid signature")
        payload = json.loads(base64.urlsafe_b64decode(raw.encode("ascii")).decode("utf-8"))
        if payload.get("exp", 0) < int(utc_now().timestamp()):
            raise ValueError("Token expired")
        return payload
    except Exception:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn.")


async def register_user(
    db: AsyncSession, name: str, email: str, phone: str, password: str
) -> dict:
    clean_email = email.strip().lower()
    clean_name = name.strip()
    clean_phone = re.sub(r"[\s().-]", "", phone.strip())
    if not clean_name:
        raise HTTPException(status_code=422, detail="Vui lòng nhập họ và tên.")
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", clean_email):
        raise HTTPException(status_code=422, detail="Email không hợp lệ.")
    if not re.match(r"^\+?[0-9]{9,15}$", clean_phone):
        raise HTTPException(status_code=422, detail="Số điện thoại không hợp lệ (cần 9-15 chữ số).")
    if len(password) < 6:
        raise HTTPException(status_code=422, detail="Mật khẩu cần có ít nhất 6 ký tự.")

    existing = await db.scalar(select(User).where(User.email == clean_email))
    if existing:
        raise HTTPException(status_code=409, detail="Email này đã được đăng ký.")

    user = User(
        name=clean_name,
        email=clean_email,
        phone=clean_phone,
        password_hash=hash_password(password),
        role=UserRole.USER.value,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "user": user,
    }


async def login_user(db: AsyncSession, email: str, password: str) -> dict:
    clean_email = email.strip().lower()
    user = await db.scalar(select(User).where(User.email == clean_email))
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu chưa đúng.")
    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "user": user,
    }


async def get_current_user_from_header(
    db: AsyncSession, authorization: str | None = Header(default=None)
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Chưa đăng nhập.")
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    user = await db.get(User, payload.get("sub"))
    if not user:
        raise HTTPException(status_code=401, detail="Tài khoản không tồn tại.")
    return user


async def require_admin(
    db: AsyncSession, authorization: str | None = Header(default=None)
) -> User:
    user = await get_current_user_from_header(db, authorization)
    if user.role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=403,
            detail="Chỉ Quản trị viên (Admin) mới có quyền thực hiện thao tác này.",
        )
    return user


async def admin_create_user(
    db: AsyncSession,
    name: str,
    email: str,
    phone: str,
    password: str,
    role: str = UserRole.GUARD.value,
) -> User:
    clean_email = email.strip().lower()
    clean_name = name.strip()
    clean_phone = re.sub(r"[\s().-]", "", phone.strip())
    if not clean_name:
        raise HTTPException(status_code=422, detail="Vui lòng nhập họ và tên.")
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", clean_email):
        raise HTTPException(status_code=422, detail="Email không hợp lệ.")
    if not re.match(r"^\+?[0-9]{9,15}$", clean_phone):
        raise HTTPException(status_code=422, detail="Số điện thoại không hợp lệ (cần 9-15 chữ số).")
    if len(password) < 6:
        raise HTTPException(status_code=422, detail="Mật khẩu cần có ít nhất 6 ký tự.")
    if role not in {UserRole.USER.value, UserRole.GUARD.value, UserRole.ADMIN.value}:
        raise HTTPException(status_code=422, detail="Vai trò không hợp lệ.")

    existing = await db.scalar(select(User).where(User.email == clean_email))
    if existing:
        raise HTTPException(status_code=409, detail="Email này đã tồn tại trong hệ thống.")

    user = User(
        name=clean_name,
        email=clean_email,
        phone=clean_phone,
        password_hash=hash_password(password),
        role=role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def admin_list_users(db: AsyncSession) -> list[User]:
    res = await db.execute(select(User).order_by(User.id.asc()))
    return list(res.scalars().all())


async def admin_delete_user(
    db: AsyncSession, user_id: int, current_admin_id: int
) -> dict:
    if user_id == current_admin_id:
        raise HTTPException(
            status_code=400, detail="Không thể tự xóa tài khoản Admin đang đăng nhập."
        )
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")
    await db.delete(target)
    await db.commit()
    return {"deleted_id": user_id, "email": target.email}
