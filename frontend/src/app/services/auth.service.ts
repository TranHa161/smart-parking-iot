import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BookingService } from './booking.service';

export type UserRole = 'user' | 'guard' | 'admin';

export interface SessionUser {
  id?: number;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  is_active?: boolean;
  created_at?: string | null;
}

export interface AuthApiResponse {
  access_token: string;
  token_type: string;
  user: SessionUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly currentUserKey = 'smart-parking-current-user';
  private readonly tokenKey = 'smart-parking-access-token';

  constructor(
    private http: HttpClient,
    private bookingService: BookingService
  ) {}

  private extractErrorMessage(err: any, fallback: string): string {
    const detail = err?.error?.detail;
    if (typeof detail === 'string') {
      return detail;
    }
    if (Array.isArray(detail) && detail.length > 0) {
      return detail.map((d: any) => d?.msg || JSON.stringify(d)).join(', ');
    }
    return fallback;
  }

  async register(
    name: string,
    email: string,
    phone: string,
    password: string
  ): Promise<{ ok: boolean; message: string; user?: SessionUser }> {
    try {
      const base = await this.bookingService.resolveApiBase();
      const res = await firstValueFrom(
        this.http.post<AuthApiResponse>(`${base}/api/auth/register`, {
          name,
          email,
          phone,
          password,
        })
      );
      localStorage.setItem(this.tokenKey, res.access_token);
      localStorage.setItem(this.currentUserKey, JSON.stringify(res.user));
      return {
        ok: true,
        message: 'Đăng ký tài khoản khách hàng thành công.',
        user: res.user,
      };
    } catch (err: any) {
      return {
        ok: false,
        message: this.extractErrorMessage(
          err,
          'Không thể đăng ký tài khoản. Vui lòng kiểm tra kết nối tới Backend.'
        ),
      };
    }
  }

  async login(
    email: string,
    password: string
  ): Promise<{ ok: boolean; message: string; role?: UserRole }> {
    try {
      const base = await this.bookingService.resolveApiBase();
      const res = await firstValueFrom(
        this.http.post<AuthApiResponse>(`${base}/api/auth/login`, {
          email,
          password,
        })
      );
      localStorage.setItem(this.tokenKey, res.access_token);
      localStorage.setItem(this.currentUserKey, JSON.stringify(res.user));
      if (res.user.role === 'guard' || res.user.role === 'admin') {
        this.bookingService.connectStaffWebSocket();
      }
      return {
        ok: true,
        message: 'Đăng nhập thành công.',
        role: res.user.role,
      };
    } catch (err: any) {
      return {
        ok: false,
        message: this.extractErrorMessage(err, 'Email hoặc mật khẩu chưa đúng.'),
      };
    }
  }

  async adminListUsers(role?: UserRole): Promise<SessionUser[]> {
    const base = await this.bookingService.resolveApiBase();
    const qs = role ? `?role=${role}` : '';
    return firstValueFrom(
      this.http.get<SessionUser[]>(`${base}/api/auth/users${qs}`)
    );
  }

  async adminCreateUser(payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }): Promise<{ ok: boolean; message: string; user?: SessionUser }> {
    try {
      const base = await this.bookingService.resolveApiBase();
      const user = await firstValueFrom(
        this.http.post<SessionUser>(`${base}/api/auth/guards`, {
          ...payload,
          role: 'guard',
        })
      );
      return {
        ok: true,
        message: `Đã cấp tài khoản Bảo vệ cho ${user.email} thành công!`,
        user,
      };
    } catch (err: any) {
      return {
        ok: false,
        message: this.extractErrorMessage(err, 'Không thể cấp tài khoản.'),
      };
    }
  }

  async adminSetUserStatus(
    userId: number,
    isActive: boolean
  ): Promise<{ ok: boolean; message: string; user?: SessionUser }> {
    try {
      const base = await this.bookingService.resolveApiBase();
      const user = await firstValueFrom(
        this.http.patch<SessionUser>(`${base}/api/auth/users/${userId}/status`, {
          is_active: isActive,
        })
      );
      return {
        ok: true,
        message: isActive
          ? `Đã mở khóa tài khoản ${user.email}.`
          : `Đã khóa tài khoản ${user.email}.`,
        user,
      };
    } catch (err: any) {
      return {
        ok: false,
        message: this.extractErrorMessage(
          err,
          'Không thể cập nhật trạng thái tài khoản.'
        ),
      };
    }
  }

  async adminResetPassword(
    userId: number,
    newPassword: string
  ): Promise<{ ok: boolean; message: string }> {
    try {
      const base = await this.bookingService.resolveApiBase();
      await firstValueFrom(
        this.http.post(`${base}/api/auth/users/${userId}/reset-password`, {
          new_password: newPassword,
        })
      );
      return {
        ok: true,
        message: 'Đã đặt lại mật khẩu thành công.',
      };
    } catch (err: any) {
      return {
        ok: false,
        message: this.extractErrorMessage(
          err,
          'Không thể đặt lại mật khẩu.'
        ),
      };
    }
  }

  async adminDeleteUser(
    userId: number
  ): Promise<{ ok: boolean; message: string }> {
    const res = await this.adminSetUserStatus(userId, false);
    return { ok: res.ok, message: res.message };
  }

  getToken(): string | null {
    return typeof window !== 'undefined'
      ? localStorage.getItem(this.tokenKey)
      : null;
  }

  getCurrentUser(): SessionUser | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(this.currentUserKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.role) {
      const em = String(parsed.email || '').toLowerCase();
      parsed.role = em.startsWith('admin@')
        ? 'admin'
        : em.startsWith('guard@')
          ? 'guard'
          : 'user';
    }
    return parsed as SessionUser;
  }

  isAdmin(): boolean {
    return this.getCurrentUser()?.role === 'admin';
  }

  isGuard(): boolean {
    return this.getCurrentUser()?.role === 'guard';
  }

  isUser(): boolean {
    return this.getCurrentUser()?.role === 'user';
  }

  logout(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.currentUserKey);
      localStorage.removeItem(this.tokenKey);
    }
    this.bookingService.disconnectStaffWebSocket();
  }
}
