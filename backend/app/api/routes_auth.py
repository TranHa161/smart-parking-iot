from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models.models import User
from app.schemas.schemas import (
    AdminCreateUserRequest,
    AuthResponse,
    PasswordChangeRequest,
    PasswordResetRequest,
    UserLoginRequest,
    UserRegisterRequest,
    UserResponse,
    UserStatusUpdate,
)
from app.services.auth_service import (
    admin_create_guard,
    admin_list_users,
    admin_reset_password,
    admin_set_active,
    change_own_password,
    login_user,
    register_user,
)

router = APIRouter(prefix="/auth", tags=["Auth - Đăng ký, Đăng nhập & Quản trị"])


@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(payload: UserRegisterRequest, db: AsyncSession = Depends(get_db)):
    """Khách hàng tự đăng ký tài khoản đặt chỗ (role luôn là 'user')."""
    return await register_user(
        db,
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        password=payload.password,
    )


@router.post("/login", response_model=AuthResponse)
async def login(payload: UserLoginRequest, db: AsyncSession = Depends(get_db)):
    return await login_user(db, email=payload.email, password=payload.password)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/change-password")
async def update_own_password(
    payload: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await change_own_password(db, current_user, payload.old_password, payload.new_password)
    return {"success": True, "message": "Đã đổi mật khẩu thành công."}


@router.get("/users", response_model=List[UserResponse])
async def list_users(
    role: Optional[str] = Query(default=None),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Xem danh sách toàn bộ tài khoản (Admin, Bảo vệ, Khách hàng)."""
    return await admin_list_users(db, role=role)


@router.post("/guards", response_model=UserResponse, status_code=201)
async def create_guard_account(
    payload: AdminCreateUserRequest,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Cấp tài khoản cho Bảo vệ trực cổng (role luôn là 'guard')."""
    return await admin_create_guard(
        db,
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        password=payload.password,
    )


@router.patch("/users/{user_id}/status", response_model=UserResponse)
async def set_user_active_status(
    user_id: int,
    payload: UserStatusUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Khóa / mở khóa tài khoản Bảo vệ hoặc Khách hàng (giữ nguyên lịch sử đối soát)."""
    return await admin_set_active(db, user_id=user_id, is_active=payload.is_active, current_admin=admin)


@router.post("/users/{user_id}/reset-password", response_model=UserResponse)
async def reset_user_password_endpoint(
    user_id: int,
    payload: PasswordResetRequest,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Đặt lại mật khẩu cho nhân viên bảo vệ hoặc khách hàng."""
    return await admin_reset_password(db, user_id=user_id, new_password=payload.new_password)


@router.delete("/users/{user_id}")
async def delete_or_deactivate_user_account(
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Thu hồi quyền truy cập tài khoản (khóa tài khoản để bảo toàn khóa ngoại lịch sử)."""
    target = await admin_set_active(db, user_id=user_id, is_active=False, current_admin=admin)
    return {"deactivated_id": target.id, "email": target.email, "is_active": target.is_active}
