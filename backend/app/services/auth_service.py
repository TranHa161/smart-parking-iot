import re

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password, verify_password
from app.models.models import User, UserRole

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PHONE_RE = re.compile(r"^\+?[0-9]{9,15}$")


def _clean_profile(name: str, email: str, phone: str, password: str) -> tuple[str, str, str]:
    clean_email = email.strip().lower()
    clean_name = name.strip()
    clean_phone = re.sub(r"[\s().-]", "", phone.strip())
    if not clean_name:
        raise HTTPException(status_code=422, detail="Vui lòng nhập họ và tên.")
    if not EMAIL_RE.match(clean_email):
        raise HTTPException(status_code=422, detail="Email không hợp lệ.")
    if not PHONE_RE.match(clean_phone):
        raise HTTPException(status_code=422, detail="Số điện thoại không hợp lệ (cần 9-15 chữ số).")
    if len(password) < 6:
        raise HTTPException(status_code=422, detail="Mật khẩu cần có ít nhất 6 ký tự.")
    return clean_name, clean_email, clean_phone


async def _create_user(db: AsyncSession, name, email, phone, password, role) -> User:
    clean_name, clean_email, clean_phone = _clean_profile(name, email, phone, password)
    if await db.scalar(select(User).where(User.email == clean_email)):
        raise HTTPException(status_code=409, detail="Email này đã được đăng ký.")
    user = User(name=clean_name, email=clean_email, phone=clean_phone,
                password_hash=hash_password(password), role=role, is_active=True)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def _auth_response(user: User) -> dict:
    return {"access_token": create_access_token(user), "token_type": "bearer", "user": user}


async def register_user(db: AsyncSession, name: str, email: str, phone: str, password: str) -> dict:
    """Đăng ký công khai: luôn là role 'user'."""
    user = await _create_user(db, name, email, phone, password, UserRole.USER.value)
    return _auth_response(user)


async def login_user(db: AsyncSession, email: str, password: str) -> dict:
    user = await db.scalar(select(User).where(User.email == email.strip().lower()))
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu chưa đúng.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Tài khoản đã bị khóa. Liên hệ quản trị viên.")
    return _auth_response(user)


async def admin_create_guard(db: AsyncSession, name: str, email: str, phone: str, password: str) -> User:
    """Admin cấp tài khoản bảo vệ. Tài khoản admin chỉ được tạo qua biến môi trường khi khởi động."""
    return await _create_user(db, name, email, phone, password, UserRole.GUARD.value)


async def admin_list_users(db: AsyncSession, role: str | None = None) -> list[User]:
    query = select(User).order_by(User.id.asc())
    if role:
        query = query.where(User.role == role)
    return list((await db.scalars(query)).all())


async def _get_target(db: AsyncSession, user_id: int) -> User:
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")
    return target


async def admin_set_active(db: AsyncSession, user_id: int, is_active: bool, current_admin: User) -> User:
    target = await _get_target(db, user_id)
    if target.id == current_admin.id and not is_active:
        raise HTTPException(status_code=400, detail="Không thể tự khóa tài khoản đang đăng nhập.")
    if target.role == UserRole.ADMIN.value and not is_active:
        active_admins = await db.scalar(select(func.count()).select_from(User).where(
            User.role == UserRole.ADMIN.value, User.is_active.is_(True)))
        if active_admins <= 1:
            raise HTTPException(status_code=400, detail="Phải còn ít nhất một quản trị viên hoạt động.")
    target.is_active = is_active
    await db.commit()
    await db.refresh(target)
    return target


async def admin_reset_password(db: AsyncSession, user_id: int, new_password: str) -> User:
    target = await _get_target(db, user_id)
    if len(new_password) < 6:
        raise HTTPException(status_code=422, detail="Mật khẩu cần có ít nhất 6 ký tự.")
    target.password_hash = hash_password(new_password)
    await db.commit()
    await db.refresh(target)
    return target


async def change_own_password(db: AsyncSession, user: User, old_password: str, new_password: str) -> None:
    if not verify_password(old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Mật khẩu hiện tại chưa đúng.")
    if len(new_password) < 6:
        raise HTTPException(status_code=422, detail="Mật khẩu cần có ít nhất 6 ký tự.")
    user.password_hash = hash_password(new_password)
    await db.commit()
