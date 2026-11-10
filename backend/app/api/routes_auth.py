from typing import List
from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.schemas import (
    AdminCreateUserRequest,
    AuthResponse,
    UserLoginRequest,
    UserRegisterRequest,
    UserResponse,
)
from app.services.auth_service import (
    admin_create_user,
    admin_delete_user,
    admin_list_users,
    get_current_user_from_header,
    login_user,
    register_user,
    require_admin,
)

router = APIRouter(prefix="/auth", tags=["Auth - Đăng ký, Đăng nhập & Quản trị"])


@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(payload: UserRegisterRequest, db: AsyncSession = Depends(get_db)):
    """Khách hàng tự đăng ký tài khoản đặt chỗ (role luôn là 'user')"""
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
async def get_me(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    return await get_current_user_from_header(db, authorization)


@router.get("/users", response_model=List[UserResponse])
async def list_users(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Xem danh sách toàn bộ tài khoản (Admin, Bảo vệ, Khách hàng)"""
    await require_admin(db, authorization)
    return await admin_list_users(db)


@router.post("/guards", response_model=UserResponse, status_code=201)
async def create_guard_account(
    payload: AdminCreateUserRequest,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Cấp tài khoản cho Bảo vệ (hoặc tài khoản hệ thống theo role)"""
    await require_admin(db, authorization)
    return await admin_create_user(
        db,
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        password=payload.password,
        role=payload.role,
    )


@router.delete("/users/{user_id}")
async def delete_user_account(
    user_id: int,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """[Admin] Thu hồi / xóa tài khoản Bảo vệ hoặc Khách hàng"""
    admin = await require_admin(db, authorization)
    return await admin_delete_user(db, user_id=user_id, current_admin_id=admin.id)
