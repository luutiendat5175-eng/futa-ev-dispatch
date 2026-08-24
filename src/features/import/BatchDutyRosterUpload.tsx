"use client";
import { FormEvent, useState } from "react";
import { authFetch } from "@/infrastructure/auth/authFetch";
type Pending = { licensePlate: string; vehicleTypeCode: string };
type ResultFile = {
  fileName: string;
  routeCode: string;
  rowsRead: number;
  vehicles?: number;
  status: string;
};
export function BatchDutyRosterUpload() {
  const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date()),
    [files, setFiles] = useState<File[]>([]),
    [date, setDate] = useState(today),
    [pending, setPending] = useState<Pending[]>([]),
    [types, setTypes] = useState<string[]>([]),
    [results, setResults] = useState<ResultFile[]>([]),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false);
  const send = async (mode: "preview" | "commit") => {
    if (!files.length) return;
    setBusy(true);
    setError(false);
    setMessage(
      mode === "preview"
        ? "Đang đọc và đối soát toàn bộ bảng tài…"
        : "Đang ghi toàn bộ phiên import…",
    );
    const body = new FormData();
    files.forEach((file) => body.append("files", file));
    body.set("serviceDate", date);
    body.set("mode", mode);
    if (pending.length) body.set("newVehicles", JSON.stringify(pending));
    try {
      const response = await authFetch("/api/v1/import/duty-roster/batch", {
          method: "POST",
          body,
        }),
        data = await response.json();
      setResults(data.files ?? []);
      if (data.needsVehicleConfirmation) {
        setPending(
          (data.missingVehicles ?? []).map((licensePlate: string) => ({
            licensePlate,
            vehicleTypeCode:
              pending.find((x) => x.licensePlate === licensePlate)
                ?.vehicleTypeCode ?? "",
          })),
        );
        setTypes(data.vehicleTypes ?? []);
        setReady(false);
      } else if (response.ok) {
        setReady(mode === "preview");
        if (mode === "commit") {
          setFiles([]);
          setPending([]);
          setReady(false);
        }
      }
      setError(!response.ok);
      setMessage(data.message ?? data.error?.message ?? "Không thể xử lý.");
      if (data.error?.details?.length)
        setMessage(`${data.error.message}\n${data.error.details.join("\n")}`);
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : "Không thể kết nối máy chủ.");
    } finally {
      setBusy(false);
    }
  };
  const choose = (selected: FileList | null) => {
    if (!selected) return;
    setFiles(Array.from(selected));
    setPending([]);
    setResults([]);
    setReady(false);
    setMessage("");
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send("preview");
  };
  return (
    <article className="import-card batch-roster-card">
      <div>
        <h2>5. Import bảng tài hàng loạt</h2>
        <p>
          Chọn tối đa 50 bảng tài. Hệ thống đối soát tất cả trước và chỉ ghi khi
          toàn bộ phiên hợp lệ.
        </p>
      </div>
      <div className="import-actions">
        <button
          type="button"
          onClick={() =>
            window.open("/api/v1/import/duty-roster/template", "_self")
          }
        >
          Tải mẫu Excel
        </button>
      </div>
      <form onSubmit={submit}>
        <label>
          Ngày vận doanh{" "}
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setReady(false);
            }}
            required
          />
        </label>
        <input
          type="file"
          accept=".xlsx,.xls"
          multiple
          onChange={(e) => choose(e.target.files)}
        />
        <button className="import-submit" disabled={!files.length || busy}>
          {busy ? "Đang xử lý…" : "Kiểm tra và đối soát"}
        </button>
      </form>
      {files.length > 0 && (
        <section className="batch-file-list">
          <h3>Đã chọn {files.length} file</h3>
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`}>
              <span>{file.name}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setFiles((old) => old.filter((_, i) => i !== index));
                  setReady(false);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </section>
      )}
      {pending.length > 0 && (
        <section className="new-vehicle-confirm">
          <h3>Xe mới cần xác nhận ({pending.length})</h3>
          {pending.map((item, index) => (
            <label key={item.licensePlate}>
              <b>{item.licensePlate}</b>
              <select
                value={item.vehicleTypeCode}
                onChange={(e) => {
                  setPending((old) =>
                    old.map((x, i) =>
                      i === index
                        ? { ...x, vehicleTypeCode: e.target.value }
                        : x,
                    ),
                  );
                  setReady(false);
                }}
              >
                <option value="">Chọn loại xe</option>
                {types.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
          ))}
          <button
            type="button"
            disabled={pending.some((x) => !x.vehicleTypeCode) || busy}
            onClick={() => void send("preview")}
          >
            Đối soát lại
          </button>
        </section>
      )}
      {results.length > 0 && (
        <section className="batch-preview">
          <h3>Kết quả đối soát</h3>
          <div className="batch-preview-head">
            <b>File</b>
            <b>Tuyến</b>
            <b>Số dòng</b>
            <b>Số xe</b>
            <b>Trạng thái</b>
          </div>
          {results.map((row) => (
            <div key={row.fileName}>
              <span>{row.fileName}</span>
              <span>{row.routeCode}</span>
              <span>{row.rowsRead}</span>
              <span>{row.vehicles ?? "—"}</span>
              <strong>{row.status === "valid" ? "Hợp lệ" : "Cần xử lý"}</strong>
            </div>
          ))}
        </section>
      )}
      {message && (
        <div
          className={
            error ? "import-result import-result-error" : "import-result"
          }
        >
          <p style={{ whiteSpace: "pre-line" }}>{message}</p>
        </div>
      )}
      {ready && (
        <button
          className="import-submit batch-commit"
          disabled={busy}
          onClick={() => void send("commit")}
        >
          Xác nhận import {results.length} tuyến
        </button>
      )}
    </article>
  );
}
