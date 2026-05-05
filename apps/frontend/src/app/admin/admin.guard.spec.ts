import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { adminGuard } from './admin.guard';
import { AdminAccessService } from '../services/admin-access.service';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable, of, firstValueFrom } from 'rxjs';

describe('adminGuard', () => {
  let adminAccessService: { access$: Observable<boolean>; isAdmin: ReturnType<typeof vi.fn> };
  let router: { createUrlTree: ReturnType<typeof vi.fn> };
  const mockUrlTree = {} as UrlTree;

  const mockRoute = {} as ActivatedRouteSnapshot;
  const mockState = {} as RouterStateSnapshot;

  beforeEach(() => {
    router = { createUrlTree: vi.fn().mockReturnValue(mockUrlTree) };

    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: router }],
    });
  });

  it('should allow navigation when admin is true', async () => {
    adminAccessService = { access$: of(true), isAdmin: vi.fn().mockReturnValue(true) };
    TestBed.overrideProvider(AdminAccessService, { useValue: adminAccessService });

    const result$ = TestBed.runInInjectionContext(() => adminGuard(mockRoute, mockState));
    const result = await firstValueFrom(result$ as any);
    expect(result).toBe(true);
  });

  it('should redirect to / when admin is false', async () => {
    adminAccessService = { access$: of(false), isAdmin: vi.fn().mockReturnValue(false) };
    TestBed.overrideProvider(AdminAccessService, { useValue: adminAccessService });

    const result$ = TestBed.runInInjectionContext(() => adminGuard(mockRoute, mockState));
    const result = await firstValueFrom(result$ as any);
    expect(result).toBe(mockUrlTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/']);
  });
});
