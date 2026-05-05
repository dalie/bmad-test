import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAccessService } from '../services/admin-access.service';
import { map } from 'rxjs';

export const adminGuard: CanActivateFn = () => {
  const adminAccess = inject(AdminAccessService);
  const router = inject(Router);

  return adminAccess.access$.pipe(map((isAdmin) => (isAdmin ? true : router.createUrlTree(['/']))));
};
