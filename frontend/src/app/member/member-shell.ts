import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'kc-member-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="mh">
      <div class="mh-in">
        <span class="logo"><i class="pi pi-heart-fill"></i></span>
        <span class="brand">Kcal Coach</span>
      </div>
    </header>
    <main class="mm">
      <router-outlet />
    </main>
    <nav class="mn" aria-label="เมนู">
      <a routerLink="/profile" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: false }">
        <i class="pi pi-user"></i><span>โปรไฟล์</span>
      </a>
      <a routerLink="/history" routerLinkActive="on">
        <i class="pi pi-chart-line"></i><span>ประวัติ</span>
      </a>
      <a routerLink="/upgrade" routerLinkActive="on">
        <i class="pi pi-crown"></i><span>แพ็กเกจ Pro</span>
      </a>
    </nav>
  `,
  styles: `
    :host { display: block; min-height: 100dvh; padding-bottom: calc(72px + env(safe-area-inset-bottom)); }
    .mh { position: sticky; top: 0; z-index: 10; background: rgba(244,247,244,.92); backdrop-filter: blur(8px); border-bottom: 1px solid var(--kc-line); }
    .mh-in { max-width: 560px; margin: 0 auto; padding: .7rem 1rem; display: flex; align-items: center; gap: .55rem; }
    .logo { width: 30px; height: 30px; border-radius: 9px; background: var(--kc-green); color: #add9bd; display: grid; place-items: center; font-size: .85rem; }
    .brand { font-weight: 700; color: var(--kc-heading); font-size: 1.05rem; letter-spacing: .2px; }
    .mm { max-width: 560px; margin: 0 auto; padding: 1rem; }
    .mn { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; background: #fff; border-top: 1px solid var(--kc-line);
          display: grid; grid-template-columns: repeat(3, 1fr); padding-bottom: env(safe-area-inset-bottom); }
    .mn a { display: flex; flex-direction: column; align-items: center; gap: .15rem; padding: .55rem 0 .6rem; color: var(--kc-muted); text-decoration: none; font-size: .78rem; }
    .mn a i { font-size: 1.15rem; }
    .mn a.on { color: var(--kc-green); font-weight: 600; }
  `,
})
export class MemberShell {}
