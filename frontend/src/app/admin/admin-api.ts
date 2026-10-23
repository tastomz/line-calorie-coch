import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api, ApiError } from '../core/api';

/** Admin API calls: 401 → /admin/login, 403 → "not an admin" screen. */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly forbidden = signal(false);

  private async wrap<T>(p: Promise<T>): Promise<T> {
    try {
      return await p;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        void this.router.navigate(['/admin/login'], { queryParams: { next: location.pathname } });
      } else if (e instanceof ApiError && e.status === 403) {
        this.forbidden.set(true);
      }
      throw e;
    }
  }

  get<T>(path: string) {
    return this.wrap(this.api.get<T>('/admin/api/' + path));
  }
  post<T>(path: string, body: unknown = {}) {
    return this.wrap(this.api.post<T>('/admin/api/' + path, body));
  }
  patch<T>(path: string, body: unknown) {
    return this.wrap(this.api.patch<T>('/admin/api/' + path, body));
  }
}
