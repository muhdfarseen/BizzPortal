import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NgpInput } from 'ng-primitives/input';
import { NgpButton } from 'ng-primitives/button';
import { NgpPassword, NgpPasswordInput, NgpPasswordToggle } from 'ng-primitives/password';
import { NgpFormField, NgpLabel } from 'ng-primitives/form-field';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { reiconEye, reiconEyeOff } from '@ng-icons/reicon';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/ui/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule,
    NgpInput,
    NgpButton,
    NgpPassword,
    NgpPasswordInput,
    NgpPasswordToggle,
    NgpFormField,
    NgpLabel,
    NgIcon,
  ],
  providers: [provideIcons({ reiconEye, reiconEyeOff })],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent {
  employeeId = '';
  password = '';
  error = signal('');
  loading = signal(false);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly toasts: ToastService,
  ) {
    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    }
  }

  onSubmit(): void {
    this.error.set('');

    if (!this.employeeId.trim() || !this.password.trim()) {
      this.error.set('Please enter both Employee ID and Password.');
      return;
    }

    this.loading.set(true);

    this.auth.login(this.employeeId, this.password).subscribe({
      next: () => {
        this.loading.set(false);
        const name = this.auth.userName();
        // Confirms the sign-in landed, which is the one piece of feedback the
        // dashboard itself cannot give.
        this.toasts.success(name ? `Welcome back, ${name}` : 'Signed in');
        this.router.navigate(['/dashboard']);
      },
      error: () => {
        // The service knows why it refused (bad input, wrong credentials, …).
        this.error.set(this.auth.loginError() ?? 'Invalid credentials. Please try again.');
        this.loading.set(false);
      },
    });
  }
}
