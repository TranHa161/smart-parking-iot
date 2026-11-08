import { Injectable } from '@angular/core';

interface DemoUser {
  name: string;
  email: string;
  phone: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly usersKey = 'smart-parking-demo-users';
  private readonly currentUserKey = 'smart-parking-current-user';

  register(name: string, email: string, phone: string, password: string): { ok: boolean; message: string } {
    const users = this.getUsers();
    if (users.some(user => user.email.toLowerCase() === email.toLowerCase())) {
      return { ok: false, message: 'Email này đã được đăng ký.' };
    }
    users.push({ name, email, phone, password });
    localStorage.setItem(this.usersKey, JSON.stringify(users));
    return { ok: true, message: 'Đăng ký thành công. Bạn có thể đăng nhập.' };
  }

  login(email: string, password: string): { ok: boolean; message: string } {
    const user = this.getUsers().find(
      item => item.email.toLowerCase() === email.toLowerCase() && item.password === password
    );
    if (!user) return { ok: false, message: 'Email hoặc mật khẩu chưa đúng' };
    localStorage.setItem(this.currentUserKey, JSON.stringify({
      name: user.name, email: user.email, phone: user.phone
    }));
    return { ok: true, message: 'Đăng nhập thành công.' };
  }

  getCurrentUser(): { name: string; email: string; phone: string } | null {
    const raw = localStorage.getItem(this.currentUserKey);
    return raw ? JSON.parse(raw) : null;
  }

  logout(): void {
    localStorage.removeItem(this.currentUserKey);
  }

  /* private getUsers(): DemoUser[] {
    return JSON.parse(localStorage.getItem(this.usersKey) || '[]') as DemoUser[];
  } */

  
  private getUsers(): DemoUser[] {
    const users = JSON.parse(
      localStorage.getItem(this.usersKey) || '[]'
    ) as DemoUser[];

    const sampleEmail = 'user@parking.com';

    // Kiểm tra tài khoản mẫu đã tồn tại chưa
    const sampleUserExists = users.some(
      user => user.email.toLowerCase() === sampleEmail
    );

    // Nếu chưa có thì tự động tạo tài khoản mẫu
    if (!sampleUserExists) {
      users.push({
        name: 'Khách hàng mẫu',
        email: sampleEmail,
        phone: '0900000000',
        password: '123456'
      });

      localStorage.setItem(
        this.usersKey,
        JSON.stringify(users)
      );
    }

    return users;
  }
}

/*
user@parking.com
123456
*/
