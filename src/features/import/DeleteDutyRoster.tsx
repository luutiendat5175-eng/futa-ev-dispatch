"use client";
import { useState } from "react";
import { authFetch } from "@/infrastructure/auth/authFetch";
export function DeleteDutyRoster() {
  const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date()),
    [date, setDate] = useState(today),
    [route, setRoute] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const remove = async () => {
    if (
      !route ||
      !confirm(
        `Xóa bảng tài tuyến ${route} ngày ${date}? Chỉ dữ liệu chưa vận hành mới được xóa.`,
      )
    )
      return;
    setBusy(true);
    const r = await authFetch("/api/v1/import/duty-roster/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceDate: date, routeCode: route }),
      }),
      data = await r.json();
    setMessage(data.message ?? data.error?.message ?? "Không thể xóa.");
    setBusy(false);
  };
  return (
    <article className="import-card">
      <div>
        <h2>Xóa bảng tài đã import</h2>
        <p>
          Chỉ admin; chỉ xóa tuyến chưa được nhận và chưa có lịch sử thao tác.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void remove();
        }}
      >
        <label>
          Ngày vận doanh{" "}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label>
          Mã tuyến{" "}
          <input
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            placeholder="Ví dụ: 141"
            required
          />
        </label>
        <button className="import-submit" disabled={busy}>
          {busy ? "Đang xóa…" : "Kiểm tra và xóa bảng tài"}
        </button>
      </form>
      {message && (
        <div className="import-result">
          <p>{message}</p>
        </div>
      )}
    </article>
  );
}
