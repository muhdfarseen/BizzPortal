import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Permission } from '../models/user.model';
import { AuthService } from '../services/auth.service';

/**
 * Functional route guard — keeps a route to the sessions holding a permission,
 * sending everyone else to the dashboard home they always have.
 *
 * The navbar already hides the tabs a role cannot use; this closes the direct
 * URL, so a route is never reachable by typing it.
 */
export function permissionGuard(permission: Permission): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (auth.has(permission)) {
      return true;
    }

    return router.createUrlTree(['/dashboard/home']);
  };
}
