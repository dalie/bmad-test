import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, catchError, of, shareReplay } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AdminAccessService {
  private readonly http = inject(HttpClient);

  readonly access$ = this.http.get<{ admin: boolean }>('/api/admin/access').pipe(
    map((res) => res.admin),
    catchError(() => of(false)),
    shareReplay(1),
  );

  readonly isAdmin = toSignal(this.access$, { initialValue: false });
}
