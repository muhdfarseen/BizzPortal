import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './shared/ui/toast-container/toast-container';

@Component({
  imports: [RouterOutlet, ToastContainerComponent],
  selector: 'app-root',
  template: `
    <router-outlet />
    <!-- Mounted once, above every route, so a message raised inside a dialog is
         never clipped by it. -->
    <app-toast-container />
  `,
  styles: `
    :host {
      display: block;
      height: 100dvh;
    }
  `,
})
export class App {}
