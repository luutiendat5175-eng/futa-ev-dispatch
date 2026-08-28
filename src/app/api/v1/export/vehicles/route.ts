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
      { error: { message: "Chỉ admin hoặc điều độ được xuất danh mục xe." } },
      { status: 403 },
    );
  const db = createServiceRoleClient();
  const data = await fetchAllPages<{
    license_plate: string;
    vehicle_type_code: string | null;
  }>((from, to) =>
    db
      .from("vehicles")
      .select("license_plate,vehicle_type_code")
      .order("license_plate")
      .range(from, to),
  );
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["Biển số", "Loại xe"],
      ...(data ?? []).map(
        (row: { license_plate: string; vehicle_type_code: string | null }) => [
          row.license_plate,
          row.vehicle_type_code ?? "",
        ],
      ),
    ]),
    "Danh mục xe",
  );
  return new NextResponse(
    XLSX.write(book, { type: "buffer", bookType: "xlsx" }),
    {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": 'attachment; filename="danh-muc-xe.xlsx"',
      },
    },
  );
}
