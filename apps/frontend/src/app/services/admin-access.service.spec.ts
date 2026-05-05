import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AdminAccessService } from './admin-access.service';

describe('AdminAccessService', () => {
  let service: AdminAccessService;
  let httpController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AdminAccessService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminAccessService);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpController.verify();
  });

  it('should call /api/admin/access and expose boolean signal', () => {
    expect(service.isAdmin()).toBe(false);

    const req = httpController.expectOne('/api/admin/access');
    expect(req.request.method).toBe('GET');
    req.flush({ admin: true });

    TestBed.flushEffects();
    expect(service.isAdmin()).toBe(true);
  });

  it('should return false when API returns admin: false', () => {
    const req = httpController.expectOne('/api/admin/access');
    req.flush({ admin: false });

    TestBed.flushEffects();
    expect(service.isAdmin()).toBe(false);
  });

  it('should return false on HTTP error', () => {
    const req = httpController.expectOne('/api/admin/access');
    req.error(new ProgressEvent('error'));

    TestBed.flushEffects();
    expect(service.isAdmin()).toBe(false);
  });
});
