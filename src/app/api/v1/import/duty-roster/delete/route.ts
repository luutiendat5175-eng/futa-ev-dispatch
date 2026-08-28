import { NextResponse } from "next/server";
import {
  getCurrentUserContext,
  UnauthenticatedError,
} from "@/infrastructure/auth/getCurrentUserContext";
import { createServiceRoleClient } from "@/infrastructure/supabase/server";
export async function POST(request: Request) {
  try {
    const actor = await getCurrentUserContext();
    if (actor.role !== "admin")
      return NextResponse.json(
        { error: { message: "Chỉ admin được xóa bảng tài." } },
        { status: 403 },
      );
    const body = await request.json(),
      serviceDate = String(body.serviceDate ?? ""),
      routeCode = String(body.routeCode ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || !routeCode)
      return NextResponse.json(
        { error: { message: "Chọn ngày vận doanh và nhập mã tuyến." } },
        { status: 400 },
      );
    const { data, error } = await createServiceRoleClient().rpc(
      "admin_delete_untouched_route_roster",
      {
        p_service_date: serviceDate,
        p_route_code: routeCode,
        p_actor_id: actor.userId,
      },
    );
    if (error) {
      const message = error.message.includes("ROUTE_HAS_OPERATION_HISTORY")
        ? "Tuyến đã được nhận hoặc có lịch sử thao tác nên không thể xóa."
        : error.message.includes("PLAN_NOT_FOUND")
          ? "Không tìm thấy kế hoạch ngày này."
          : error.message;
      return NextResponse.json({ error: { message } }, { status: 409 });
    }
    return NextResponse.json({
      message: `Đã xóa bảng tài tuyến ${routeCode} ngày ${serviceDate} (${data ?? 0} task).`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message:
            error instanceof UnauthenticatedError
              ? "Bạn cần đăng nhập lại."
              : error instanceof Error
                ? error.message
                : "Không thể xóa bảng tài.",
        },
      },
      { status: error instanceof UnauthenticatedError ? 401 : 400 },
    );
  }
}
