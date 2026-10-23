import { Injectable } from '@angular/core';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Thin fetch wrapper: same-origin cookies, JSON in/out, readable errors. */
@Injectable({ providedIn: 'root' })
export class Api {
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(path, {
      credentials: 'include',
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { message: text };
    }
    if (!res.ok) {
      const d = (data ?? {}) as { message?: unknown; error?: unknown; code?: unknown };
      const raw = d.message ?? d.error ?? d.code ?? res.statusText;
      const msg = Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' ? raw : 'เกิดข้อผิดพลาด';
      throw new ApiError(msg, res.status);
    }
    return data as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  }
}

export function errorMessage(e: unknown, fallback = 'เกิดข้อผิดพลาด'): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
