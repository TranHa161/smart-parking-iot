import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, UserRole } from '../services/auth.service';

export function roleGuard(allowedRoles: UserRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const user = auth.getCurrentUser();
    const token = auth.getToken();

    if (!user || !token) {
      return router.createUrlTree(['/login']);
    }

    if (!allowedRoles.includes(user.role)) {
      if (user.role === 'admin') {
        return router.createUrlTree(['/admin']);
      }
      if (user.role === 'guard') {
        return router.createUrlTree(['/guard']);
      }
      return router.createUrlTree(['/home']);
    }

    return true;
  };
}

export const userGuard: CanActivateFn = roleGuard(['user']);
export const staffGuard: CanActivateFn = roleGuard(['guard', 'admin']);
export const adminGuard: CanActivateFn = roleGuard(['admin']);
