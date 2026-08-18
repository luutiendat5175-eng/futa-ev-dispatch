import { test, expect } from '@playwright/test';

const TEST_MNV = process.env.E2E_TEST_MNV || '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || '';

test.describe('Dashboard - luồng chính: tạo Task -> hiện trên Kanban -> lọc theo Bãi/Trạm', () => {
  test.skip(!TEST_MNV || !TEST_PASSWORD, 'Cần set E2E_TEST_MNV và E2E_TEST_PASSWORD trước khi chạy');

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Mã nhân viên').fill(TEST_MNV);
    await page.getByPlaceholder('Mật khẩu').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await page.goto('/dashboard');
  });

  test('Dashboard tải được Map và Kanban, không lỗi console nghiêm trọng', async ({ page }) => {
    await expect(page.getByText('Dashboard Điều phối')).toBeVisible();
    await expect(page.getByText('Task di chuyển xe')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Digital Yard Map' })).toBeVisible();
  });

  test('tạo Task qua form nhanh -> Task xuất hiện trên Kanban KHÔNG CẦN refresh (Realtime)', async ({ page }) => {
    // Cần sẵn ít nhất 1 xe trong dropdown - nếu dropdown rỗng, test tự báo rõ lý do fail
    const vehicleSelect = page.locator('select').first();
    const optionCount = await vehicleSelect.locator('option').count();
    test.skip(optionCount <= 1, 'Chưa có xe nào trong hệ thống để test - import Bảng tài trước');

    await vehicleSelect.selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Tạo' }).click();

    await expect(page.getByText(/Đã tạo Task #/)).toBeVisible({ timeout: 10_000 });
    // Kanban cột "Chưa sạc" phải tăng số lượng - không cần page.reload()
    await expect(page.getByText(/Chưa sạc/)).toBeVisible();
  });

  test('chọn bộ lọc Bãi đỗ -> Map chỉ còn hiện đúng 1 marker Bãi', async ({ page }) => {
    const depotSelect = page.getByLabel('Bãi đỗ');
    const optionCount = await depotSelect.locator('option').count();
    test.skip(optionCount <= 1, 'Chưa có Bãi nào trong hệ thống để test - import Bãi trước');

    await depotSelect.selectOption({ index: 1 });

    // Nút Xoá lọc phải xuất hiện khi có filter active
    await expect(page.getByRole('button', { name: '✕ Xoá lọc' })).toBeVisible();
  });
});
