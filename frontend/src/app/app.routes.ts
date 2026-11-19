import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { HomeComponent } from './pages/home/home.component';
import { BookingComponent } from './pages/booking/booking.component';
import { ConfirmationComponent } from './pages/confirmation/confirmation.component';
import { GuardComponent } from './pages/guard/guard.component';
import { AdminComponent } from './pages/admin/admin.component';
import { adminGuard, staffGuard, userGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'home', component: HomeComponent },
  { path: 'booking', component: BookingComponent, canActivate: [userGuard] },
  { path: 'booking/confirmation', component: ConfirmationComponent, canActivate: [userGuard] },
  { path: 'guard', component: GuardComponent, canActivate: [staffGuard] },
  { path: 'admin', component: AdminComponent, canActivate: [adminGuard] },
  { path: '**', redirectTo: 'home' }
];
