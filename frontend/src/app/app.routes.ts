import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { HomeComponent } from './pages/home/home.component';
import { BookingComponent } from './pages/booking/booking.component';
import { ConfirmationComponent } from './pages/confirmation/confirmation.component';
import { GuardComponent } from './pages/guard/guard.component';
import { AdminComponent } from './pages/admin/admin.component';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'home', component: HomeComponent },
  { path: 'booking', component: BookingComponent },
  { path: 'booking/confirmation', component: ConfirmationComponent },
  { path: 'guard', component: GuardComponent },
  { path: 'admin', component: AdminComponent },
  { path: '**', redirectTo: 'home' }
];
