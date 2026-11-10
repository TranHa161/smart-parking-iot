import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BookingService } from './booking.service';

export type UserRole = 'user' | 'guard' | 'admin';

export interface SessionUser {
  id?: number;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
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

  private authHeaders(): HttpHeaders {
    const token = this.getToken();
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
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

  async adminListUsers(): Promise<SessionUser[]> {
    const base = await this.bookingService.resolveApiBase();
    return firstValueFrom(
      this.http.get<SessionUser[]>(`${base}/api/auth/users`, {
        headers: this.authHeaders(),
      })
    );
  }

  async adminCreateUser(payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: UserRole;
  }): Promise<{ ok: boolean; message: string; user?: SessionUser }> {
    try {
      const base = await this.bookingService.resolveApiBase();
      const user = await firstValueFrom(
        this.http.post<SessionUser>(`${base}/api/auth/guards`, payload, {
          headers: this.authHeaders(),
        })
      );
      return {
        ok: true,
        message: `Đã cấp tài khoản ${user.role === 'guard' ? 'Bảo vệ' : user.role} cho ${user.email} thành công!`,
        user,
      };
    } catch (err: any) {
      return {
        ok: false,
        message: this.extractErrorMessage(err, 'Không thể cấp tài khoản.'),
      };
    }
  }

  async adminDeleteUser(
    userId: number
  ): Promise<{ ok: boolean; message: string }> {
    try {
      const base = await this.bookingService.resolveApiBase();
      await firstValueFrom(
        this.http.delete(`${base}/api/auth/users/${userId}`, {
          headers: this.authHeaders(),
        })
      );
      return { ok: true, message: 'Đã thu hồi tài khoản thành công.' };
    } catch (err: any) {
      return {
        ok: false,
        message: this.extractErrorMessage(err, 'Không thể xóa tài khoản.'),
      };
    }
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getCurrentUser(): SessionUser | null {
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
    localStorage.removeItem(this.currentUserKey);
    localStorage.removeItem(this.tokenKey);
  }
}
