import { Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { AdminApi } from './admin-api';

type NavItem = { label: string; icon: string; link: string; exact?: boolean };

@Component({
  selector: 'kc-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonModule, DrawerModule, NgTemplateOutlet],
  template: `
    <ng-template #nav>
      <div class="brand"><span class="logo"><i class="pi pi-heart-fill"></i></span><div><b>Kcal Coach</b><small>Admin</small></div></div>
      <nav>
        @for (n of items; track n.link) {
          <a [routerLink]="n.link" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: !!n.exact }" (click)="drawer.set(false)">
            <i class="pi {{ n.icon }}"></i><span>{{ n.label }}</span>
          </a>
        }
      </nav>
      <button type="button" class="logout" (click)="logout()"><i class="pi pi-sign-out"></i><span>ออกจากระบบ</span></button>
    </ng-template>

    <aside class="side"><ng-container *ngTemplateOutlet="nav" /></aside>
    <p-drawer [visible]="drawer()" (visibleChange)="drawer.set($event)" styleClass="kc-admin-drawer" [showCloseIcon]="true">
      <ng-container *ngTemplateOutlet="nav" />
    </p-drawer>

    <div class="main">
      <header class="top">
        <p-button icon="pi pi-bars" [text]="true" severity="secondary" (onClick)="drawer.set(true)" styleClass="burger" ariaLabel="เมนู" />
        <b class="top-brand">Kcal Coach Admin</b>
      </header>
      <div class="content">
        @if (adminApi.forbidden()) {
          <div class="kc-card kc-center">
            <h2>ไม่มีสิทธิ์ Admin</h2>
            <p class="kc-muted">บัญชีนี้ไม่ใช่ ADMIN</p>
            <a href="/profile">กลับหน้าโปรไฟล์</a>
          </div>
        } @else {
          <router-outlet />
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: flex; min-height: 100dvh; }
    .side { width: 240px; flex: 0 0 240px; background: #0f2a1b; color: #d6ecdd; padding: 1.1rem .8rem; position: sticky; top: 0; height: 100dvh;
            display: flex; flex-direction: column; }
    .brand { display: flex; align-items: center; gap: .6rem; padding: 0 .5rem 1.2rem; }
    .brand b { display: block; color: #fff; font-size: 1rem; }
    .brand small { color: #7cbf96; font-size: .78rem; }
    .logo { width: 36px; height: 36px; border-radius: 10px; background: #2f8453; color: #d6ecdd; display: grid; place-items: center; }
    nav { display: flex; flex-direction: column; gap: .2rem; flex: 1; }
    nav a, .logout { display: flex; align-items: center; gap: .7rem; padding: .62rem .75rem; border-radius: 10px; color: #c2dccb; text-decoration: none;
             font: inherit; font-size: .93rem; background: none; border: 0; cursor: pointer; text-align: left; width: 100%; }
    nav a:hover, .logout:hover { background: rgba(255,255,255,.06); color: #fff; }
    nav a.on { background: #2f8453; color: #fff; font-weight: 600; }
    nav a i, .logout i { width: 1.1rem; }
    .main { flex: 1; min-width: 0; }
    .top { display: none; }
    .content { padding: 1.5rem 1.75rem 3rem; max-width: 1100px; }
    @media (max-width: 900px) {
      .side { display: none; }
      .top { display: flex; align-items: center; gap: .3rem; position: sticky; top: 0; z-index: 5; background: #fff; border-bottom: 1px solid var(--kc-line); padding: .35rem .5rem; }
      .top-brand { color: var(--kc-heading); }
      .content { padding: 1rem; }
    }
    :host ::ng-deep .kc-admin-drawer { background: #0f2a1b; color: #d6ecdd; width: 270px; }
    :host ::ng-deep .kc-admin-drawer .p-drawer-content { display: flex; flex-direction: column; }
  `,
})
export class AdminShell {
  readonly adminApi = inject(AdminApi);
  private readonly router = inject(Router);
  readonly drawer = signal(false);
  readonly items: NavItem[] = [
    { label: 'ภาพรวม', icon: 'pi-home', link: '/admin', exact: true },
    { label: 'ผู้ใช้', icon: 'pi-users', link: '/admin/users' },
    { label: 'โค้ดโปรโม', icon: 'pi-gift', link: '/admin/promos' },
    { label: 'แพ็กเกจ & ราคา', icon: 'pi-tags', link: '/admin/plans' },
    { label: 'AI Usage', icon: 'pi-chart-bar', link: '/admin/ai-usage' },
    { label: 'ตั้งค่า', icon: 'pi-cog', link: '/admin/settings' },
  ];

  async logout() {
    try {
      await this.adminApi.post('logout');
    } finally {
      void this.router.navigate(['/admin/login']);
    }
  }
}
