import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

/**
 * Load test cho API dispatch-tasks - mô phỏng ~50 Task được tạo ĐỒNG THỜI,
 * đúng yêu cầu thiết kế "Load test cơ bản cho endpoint realtime với ~50 task đồng thời".
 *
 * Test API tạo Task (POST /api/v1/tasks) - đây là API sinh ra thay đổi mà
 * Supabase Realtime sẽ đẩy đi. K6 không test trực tiếp được WebSocket Realtime
 * (cần thêm module riêng), nên bài test này đo khả năng CHỊU TẢI của API tạo Task -
 * còn việc Realtime có đẩy kịp không, kiểm tra bằng MẮT qua bước 5 trong hướng dẫn
 * (mở /task-board-demo song song lúc chạy test).
 *
 * CHẠY: k6 run load-test/dispatch-tasks-load-test.js
 * Cần biến môi trường:
 *   BASE_URL      - vd http://localhost:3000 (test local) hoặc URL Vercel đã deploy
 *   VEHICLE_IDS_JSON - đường dẫn file JSON chứa mảng UUID xe test (xem HUONG_DAN bên dưới)
 *   CREATED_BY    - uuid 1 user bất kỳ trong bảng users (để field created_by hợp lệ)
 */

const vehicleIds = new SharedArray('vehicleIds', function () {
  return JSON.parse(open(__ENV.VEHICLE_IDS_JSON || './vehicle-ids.json'));
});

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const CREATED_BY = __ENV.CREATED_BY;

export const options = {
  scenarios: {
    concurrent_task_creation: {
      executor: 'per-vu-iterations',
      vus: 50, // 50 "người dùng ảo" chạy song song, đúng yêu cầu ~50 task đồng thời
      iterations: 1, // mỗi VU chỉ tạo 1 Task (mô phỏng đúng "50 task cùng lúc", không lặp lại)
      maxDuration: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% request phải xong dưới 2 giây
    http_req_failed: ['rate<0.05'], // tỷ lệ lỗi phải dưới 5%
  },
};

export default function () {
  const vehicleId = vehicleIds[__VU % vehicleIds.length];

  const payload = JSON.stringify({
    vehicleId,
    loaiTask: 'di_chuyen',
    createdBy: CREATED_BY,
  });

  const res = http.post(`${BASE_URL}/api/v1/tasks`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'status là 201 (tạo thành công)': (r) => r.status === 201,
    'thời gian phản hồi < 2s': (r) => r.timings.duration < 2000,
  });

  sleep(0.1);
}
