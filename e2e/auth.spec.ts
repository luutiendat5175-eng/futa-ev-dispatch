import { test, expect } from '@playwright/test';

/**
 * Cần biến môi trường (tạo file .env.e2e hoặc export trước khi chạy):
 *   E2E_TEST_MNV      - mã nhân viên của 1 tài khoản test có thật trong DB
 *   E2E_TEST_PASSWORD - mật khẩu tài khoản đó
 *
 * Xem HUONG_DAN_E2E.md để biết cách chuẩn bị tài khoản test.
 */
const TEST_MNV = process.env.E2E_TEST_MNV || '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || '';

test.describe('Auth - middleware chặn truy cập khi chưa đăng nhập', () => {
  test('vào /dashboard khi chưa đăng nhập -> tự động redirect về /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('vào /task-board-demo khi chưa đăng nhập -> tự động redirect về /login', async ({ page }) => {
    await page.goto('/task-board-demo');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Auth - luồng đăng nhập bằng Mã nhân viên', () => {
  test.skip(!TEST_MNV || !TEST_PASSWORD, 'Cần set E2E_TEST_MNV và E2E_TEST_PASSWORD trước khi chạy');

  test('đăng nhập đúng MNV/mật khẩu -> vào được trang sau đăng nhập', async ({ page }) => {
    await page.goto('/login');

    await page.getByPlaceholder('Mã nhân viên').fill(TEST_MNV);
    await page.getByPlaceholder('Mật khẩu').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    // Sau đăng nhập thành công, không còn ở /login nữa
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('sai mật khẩu -> báo lỗi, KHÔNG chuyển trang', async ({ page }) => {
    await page.goto('/login');

    await page.getByPlaceholder('Mã nhân viên').fill(TEST_MNV);
    await page.getByPlaceholder('Mật khẩu').fill('mat-khau-sai-chac-chan');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    await expect(page.getByText('Mã nhân viên hoặc mật khẩu không đúng')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('đăng nhập xong -> bấm Đăng xuất -> quay lại /login, vào /dashboard lại bị chặn', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Mã nhân viên').fill(TEST_MNV);
    await page.getByPlaceholder('Mật khẩu').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
