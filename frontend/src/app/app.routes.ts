import { Routes } from '@angular/router';
import { MemberShell } from './member/member-shell';
import { ProfilePage } from './member/pages/profile';
import { HistoryPage } from './member/pages/history';
import {
  CancelPage,
  LandingPage,
  MemberLoginPage,
  MockCheckoutPage,
  SuccessPage,
  UpgradePage,
} from './member/pages/simple-pages';

// Admin is lazy-loaded so the LIFF pages stay small on phones.
const adminA = () => import('./admin/pages/login-overview-users');
const adminB = () => import('./admin/pages/promos-plans');
const adminC = () => import('./admin/pages/usage-settings');

/**
 * URLs are the same as the old static pages — LINE rich menu / LIFF links,
 * Stripe success/cancel URLs and bookmarks keep working.
 */
export const routes: Routes = [
  { path: 'login', component: MemberLoginPage, title: 'เข้าสู่ระบบ · Kcal Coach' },
  { path: 'membership/login', component: MemberLoginPage, title: 'เข้าสู่ระบบ · Kcal Coach' },
  { path: 'admin/login', loadComponent: () => adminA().then((m) => m.AdminLoginPage), title: 'Admin · Kcal Coach' },
  {
    path: 'admin',
    loadComponent: () => import('./admin/admin-shell').then((m) => m.AdminShell),
    children: [
      { path: '', loadComponent: () => adminA().then((m) => m.AdminOverviewPage), title: 'ภาพรวม · Admin' },
      { path: 'dashboard', redirectTo: '', pathMatch: 'full' },
      { path: 'users', loadComponent: () => adminA().then((m) => m.AdminUsersPage), title: 'ผู้ใช้ · Admin' },
      { path: 'promos', loadComponent: () => adminB().then((m) => m.AdminPromosPage), title: 'โค้ดโปรโม · Admin' },
      { path: 'plans', loadComponent: () => adminB().then((m) => m.AdminPlansPage), title: 'แพ็กเกจ · Admin' },
      { path: 'ai-usage', loadComponent: () => adminC().then((m) => m.AdminUsagePage), title: 'AI Usage · Admin' },
      { path: 'settings', loadComponent: () => adminC().then((m) => m.AdminSettingsPage), title: 'ตั้งค่า · Admin' },
    ],
  },
  {
    path: '',
    component: MemberShell,
    children: [
      { path: 'profile', component: ProfilePage, title: 'โปรไฟล์ · Kcal Coach' },
      { path: 'account', component: ProfilePage, title: 'โปรไฟล์ · Kcal Coach' },
      { path: 'membership/account', component: ProfilePage, title: 'โปรไฟล์ · Kcal Coach' },
      { path: 'history', component: HistoryPage, title: 'ประวัติ · Kcal Coach' },
      // LIFF opens liff.line.me/{id}/history as <endpoint>/history.
      { path: 'profile/history', component: HistoryPage, title: 'ประวัติ · Kcal Coach' },
      { path: 'upgrade', component: UpgradePage, title: 'สมัคร Pro · Kcal Coach' },
      { path: 'membership/upgrade', component: UpgradePage, title: 'สมัคร Pro · Kcal Coach' },
      { path: 'membership', component: LandingPage, title: 'Tastom Pro' },
      { path: 'membership/success', component: SuccessPage, title: 'ชำระเงินเรียบร้อย · Kcal Coach' },
      { path: 'membership/cancel', component: CancelPage, title: 'ยกเลิกการชำระเงิน · Kcal Coach' },
      { path: 'membership/mock-checkout', component: MockCheckoutPage, title: 'Mock Checkout' },
      { path: '', redirectTo: 'profile', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'profile' },
];
