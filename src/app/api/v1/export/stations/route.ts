import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createServiceRoleClient } from "@/infrastructure/supabase/server";
import { getCurrentUserContext } from "@/infrastructure/auth/getCurrentUserContext";
import { canPerform } from "@/shared/permissions/permissionMatrix";
import { fetchAllPages } from "@/infrastructure/supabase/fetchAllPages";

export const runtime = "nodejs";

export async function GET() {
  const actor = await getCurrentUserContext();
  if (!canPerform(actor.role, "import_bang_tuyen_sheet"))
    return NextResponse.json(
      { error: { message: "Chỉ admin hoặc điều độ được xuất dữ liệu nền." } },
      { status: 403 },
    );
  const db = createServiceRoleClient();
  const data = await fetchAllPages<any>((from, to) =>
    db
      .from("charging_stations")
      .select("name,x,y")
      .order("name")
      .range(from, to),
  );
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["Tên trạm", "X", "Y", "Công suất"],
      ...(data ?? []).map((row: any) => [row.name, row.x, row.y, ""]),
    ]),
    "Trạm sạc",
  );
  return new NextResponse(
    XLSX.write(book, { type: "buffer", bookType: "xlsx" }),
    {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": 'attachment; filename="danh-muc-tram-sac.xlsx"',
      },
    },
  );
}
