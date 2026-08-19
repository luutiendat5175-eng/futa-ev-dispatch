'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getSidebarMenuForRole, type SidebarMenuItem } from '@/domain/layout/sidebarMenu';
import type { UserRole } from '@/domain/task/taskStateMachine';
import { authFetch } from '@/infrastructure/auth/authFetch';

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Quản trị viên',
  dieu_phoi: 'Điều phối trạm',
  dieu_do: 'Điều độ dữ liệu',
  lai_xe: 'Lái xe di dời',
};

export function Sidebar() {
  const pathname = usePathname();
  const [menu, setMenu] = useState<SidebarMenuItem[]>([]);
  const [userInfo, setUserInfo] = useState<{ fullName: string; role: UserRole } | null>(null);

  useEffect(() => {
    authFetch('/api/v1/me').then((res) => (res.ok ? res.json() : null)).then((data) => {
      if (!data) return;
      setUserInfo({ fullName: data.fullName, role: data.role });
      setMenu(getSidebarMenuForRole(data.role));
    }).catch(() => undefined);
  }, []);

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand"><strong>FUTA - EV DISPATCH</strong><span>Điều phối di dời xe</span></div>
      <nav className="sidebar-nav" aria-label="Điều hướng chính">
        {menu.map((item) => <Link key={item.href} href={item.href} className={pathname === item.href ? 'active' : ''}>
          <span aria-hidden>{item.icon}</span>{item.label}
        </Link>)}
      </nav>
      {userInfo && <div className="sidebar-user"><strong>{userInfo.fullName}</strong><span>{ROLE_LABEL[userInfo.role]}</span></div>}
    </aside>
  );
}
