'use client';

import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return <button onClick={toggleTheme} aria-label="Chuyển giao diện sáng hoặc tối" style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', background: isDark ? '#1e293b' : '#fff', color: isDark ? '#fff' : '#000', cursor: 'pointer', fontSize: 13 }}>{isDark ? 'Giao diện sáng' : 'Giao diện tối'}</button>;
}
