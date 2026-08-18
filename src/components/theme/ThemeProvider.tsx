'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'ev-dispatch-theme';

/**
 * Quản lý Dark/Light mode theo yêu cầu thiết kế UI (Material Design 3, Dark/Light Mode).
 * Lưu lựa chọn vào localStorage để giữ nguyên giữa các lần load trang.
 * Áp dụng bằng cách toggle class "dark" trên thẻ <html> - khớp với cách Tailwind
 * dark: variant hoạt động (darkMode: 'class'), các component như YardMapCanvas
 * đã dùng sẵn class dark: nên tự động ăn theo khi đổi theme, không cần sửa gì thêm.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initial =
      saved ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(initial);
    document.documentElement.classList.toggle('dark', initial === 'dark');
  }, []);

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      return next;
    });
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme phải dùng bên trong <ThemeProvider>');
  return ctx;
}

