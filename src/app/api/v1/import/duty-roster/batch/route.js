import { NextResponse } from "next/server";
import { parseDutyRosterSheet } from "@/domain/schedule/parseDutyRosterSheet";
import { createServiceRoleClient } from "@/infrastructure/supabase/server";
import {
  getCurrentUserContext,
  UnauthenticatedError
} from "@/infrastructure/auth/getCurrentUserContext";
const normalize = (v) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[đð]/g, "d").replace(/[^a-z0-9]+/g, "").replace(/[aeiouy]/g, "");
const confirmations = (value) => {
  try {
    const x = JSON.parse(typeof value === "string" ? value : "[]");
    return Array.isArray(x) ? x.map((y) => ({
      licensePlate: String(y.licensePlate ?? "").trim().toUpperCase(),
      vehicleTypeCode: String(y.vehicleTypeCode ?? "").trim().toUpperCase()
    })).filter((x2) => x2.licensePlate) : [];
  } catch {
    return [];
  }
};
const fail = (message, status = 422, details = []) => NextResponse.json({ error: { message, details } }, { status });
async function POST(request) {
  try {
    const actor = await getCurrentUserContext();
    if (!["admin", "dieu_do"].includes(actor.role))
      return fail(
        "Ch\u1EC9 admin ho\u1EB7c \u0111i\u1EC1u \u0111\u1ED9 \u0111\u01B0\u1EE3c import b\u1EA3ng t\xE0i h\xE0ng lo\u1EA1t.",
        403
      );
    const form = await request.formData(), files = form.getAll("files").filter((x) => x instanceof File && x.size > 0), mode = form.get("mode") === "commit" ? "commit" : "preview", selectedDate = String(form.get("serviceDate") ?? "").trim();
    if (files.length < 1) return fail("Ch\u1ECDn \xEDt nh\u1EA5t m\u1ED9t b\u1EA3ng t\xE0i.", 400);
    if (files.length > 50)
      return fail("M\u1ED7i phi\xEAn h\u1ED7 tr\u1EE3 t\u1ED1i \u0111a 50 b\u1EA3ng t\xE0i.", 400);
    const parsed = [];
    for (const file of files) {
      const p = parseDutyRosterSheet(
        Buffer.from(await file.arrayBuffer()),
        file.name
      );
      if (p.errors.length || !p.header)
        return fail(
          `File ${file.name}: ${p.errors.join(" ") || "Kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c b\u1EA3ng t\xE0i."}`
        );
      const [d, m, y] = p.header.ngay.split("/");
      parsed.push({
        fileName: file.name,
        header: p.header,
        trips: p.trips,
        date: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
      });
    }
    const routeCodes = parsed.map((x) => x.header.mst), duplicates = routeCodes.filter((x, i) => routeCodes.indexOf(x) !== i);
    if (duplicates.length)
      return fail(
        `M\u1ED9t tuy\u1EBFn ch\u1EC9 \u0111\u01B0\u1EE3c xu\u1EA5t hi\u1EC7n trong m\u1ED9t phi\xEAn: ${[...new Set(duplicates)].join(", ")}.`
      );
    const dates = [...new Set(parsed.map((x) => x.date))], serviceDate = selectedDate || dates[0];
    if (!serviceDate || dates.some((x) => x !== serviceDate))
      return fail(
        `Ng\xE0y trong c\xE1c file ph\u1EA3i c\xF9ng ng\xE0y v\u1EADn doanh ${serviceDate || ""}.`,
        422,
        parsed.map((x) => `${x.fileName}: ${x.date}`)
      );
    const db = createServiceRoleClient();
    let { data: plan } = await db.from("daily_plans").select("id,status").eq("service_date", serviceDate).maybeSingle();
    if (!plan && mode === "commit") {
      const snap = await db.rpc("snapshot_active_overnight_config", {
        p_service_date: serviceDate,
        p_actor_id: actor.userId
      });
      plan = snap.data;
    }
    if (!plan)
      return fail(
        `Ch\u01B0a c\xF3 snapshot PA \u0111\u1EADu \u0111\xEAm cho ng\xE0y ${serviceDate}. H\xE3y t\u1EA1o k\u1EBF ho\u1EA1ch ng\xE0y tr\u01B0\u1EDBc khi \u0111\u1ED1i so\xE1t h\xE0ng lo\u1EA1t.`,
        409
      );
    if (plan.status === "locked") return fail("K\u1EBF ho\u1EA1ch ng\xE0y \u0111\xE3 kh\xF3a.", 409);
    const { data: endRows, error: endError } = await db.from("plan_route_ends").select(
      "id,route_code,route_end_name,mobilization_minutes,buffer_minutes"
    ).eq("daily_plan_id", plan.id).in("route_code", routeCodes);
    if (endError) throw endError;
    const ends = endRows ?? [], issues = [];
    for (const p of parsed) {
      const routeEnds = ends.filter((e) => e.route_code === p.header.mst), keys = new Set(routeEnds.map((e) => normalize(e.route_end_name))), missing2 = [
        ...new Set(
          p.trips.map((t) => t.diemDau).filter((name) => !keys.has(normalize(name)))
        )
      ];
      if (!routeEnds.length)
        issues.push(`${p.fileName}: PA ch\u01B0a c\xF3 tuy\u1EBFn ${p.header.mst}.`);
      if (missing2.length)
        issues.push(
          `${p.fileName}: \u0111\u1EA7u b\u1EBFn kh\xF4ng kh\u1EDBp PA: ${missing2.join(", ")}.`
        );
    }
    if (issues.length)
      return fail(
        "C\xF3 b\u1EA3ng t\xE0i ch\u01B0a kh\u1EDBp PA. Kh\xF4ng c\xF3 d\u1EEF li\u1EC7u n\xE0o \u0111\u01B0\u1EE3c ghi.",
        422,
        issues
      );
    const occurrences = /* @__PURE__ */ new Map();
    for (const p of parsed)
      for (const plate of new Set(p.trips.map((t) => t.bienSo)))
        occurrences.set(plate, [
          ...occurrences.get(plate) ?? [],
          p.header.mst
        ]);
    const cross = [...occurrences].filter(
      ([, routes2]) => new Set(routes2).size > 1
    );
    if (cross.length)
      return fail(
        "C\xF3 xe xu\u1EA5t hi\u1EC7n \u1EDF nhi\u1EC1u tuy\u1EBFn trong c\xF9ng phi\xEAn.",
        422,
        cross.map(
          ([plate, routes2]) => `${plate}: tuy\u1EBFn ${[...new Set(routes2)].join(", ")}`
        )
      );
    const plates = [...occurrences.keys()], { data: vehicleRows } = await db.from("vehicles").select("id,license_plate,vehicle_type_code").in("license_plate", plates);
    let vehicles = vehicleRows ?? [], byPlate = new Map(vehicles.map((v) => [v.license_plate, v])), missing = plates.filter((p) => !byPlate.has(p)), confirmed = new Map(
      confirmations(form.get("newVehicles")).map((x) => [x.licensePlate, x])
    );
    if (missing.some((p) => !confirmed.get(p)?.vehicleTypeCode)) {
      const { data: types } = await db.from("vehicle_types").select("code").eq("is_active", true).order("code");
      return NextResponse.json(
        {
          needsVehicleConfirmation: true,
          missingVehicles: missing,
          vehicleTypes: (types ?? []).map((x) => x.code),
          files: parsed.map((p) => ({
            fileName: p.fileName,
            routeCode: p.header.mst,
            rowsRead: p.trips.length,
            status: "needs_vehicle"
          })),
          message: "Ch\u1ECDn lo\u1EA1i xe cho c\xE1c bi\u1EC3n s\u1ED1 m\u1EDBi r\u1ED3i \u0111\u1ED1i so\xE1t l\u1EA1i."
        },
        { status: 422 }
      );
    }
    if (mode === "commit" && missing.length) {
      const rows = missing.map((p) => confirmed.get(p));
      const { error } = await db.from("vehicles").insert(
        rows.map((x) => ({
          license_plate: x.licensePlate,
          vehicle_type_code: x.vehicleTypeCode
        }))
      );
      if (error) throw error;
      const reloaded = await db.from("vehicles").select("id,license_plate,vehicle_type_code").in("license_plate", plates);
      vehicles = reloaded.data ?? [];
      byPlate = new Map(vehicles.map((v) => [v.license_plate, v]));
    } else
      for (const plate of missing) {
        const c = confirmed.get(plate);
        byPlate.set(plate, {
          id: `preview:${plate}`,
          license_plate: plate,
          vehicle_type_code: c.vehicleTypeCode
        });
      }
    const codes = [
      ...new Set(
        [...byPlate.values()].map((v) => v.vehicle_type_code).filter(Boolean)
      )
    ], { data: typeRows } = await db.from("vehicle_types").select("code,charge_minutes").in("code", codes), charge = new Map(
      (typeRows ?? []).map((x) => [
        x.code,
        x.charge_minutes
      ])
    ), routes = [];
    for (const p of parsed) {
      const routeEnds = ends.filter((e) => e.route_code === p.header.mst), endMap = /* @__PURE__ */ new Map();
      for (const e of routeEnds)
        endMap.set(normalize(e.route_end_name), [
          ...endMap.get(normalize(e.route_end_name)) ?? [],
          e
        ]);
      const reduced = /* @__PURE__ */ new Map();
      for (const t of p.trips) {
        const end = (endMap.get(normalize(t.diemDau)) ?? [])[t.endOrdinal] ?? (endMap.get(normalize(t.diemDau)) ?? [])[0], vehicle = byPlate.get(t.bienSo);
        if (!end || !vehicle) continue;
        const departure = /* @__PURE__ */ new Date(`${serviceDate}T${t.gioXB}:00+07:00`), current = reduced.get(vehicle.license_plate);
        if (!current || departure < current.departure)
          reduced.set(vehicle.license_plate, {
            end,
            vehicle,
            departure,
            sequence: t.soTai
          });
      }
      const perEnd = /* @__PURE__ */ new Map();
      for (const item of reduced.values())
        perEnd.set(item.end.id, [...perEnd.get(item.end.id) ?? [], item]);
      const schedules = [...perEnd.values()].flatMap(
        (items) => items.sort(
          (a, b) => +a.departure - +b.departure || a.sequence - b.sequence
        ).map((x, index) => ({
          vehicle_id: x.vehicle.id,
          plan_route_end_id: x.end.id,
          earliest_departure_at: x.departure.toISOString(),
          lct_at: new Date(
            +x.departure - ((charge.get(x.vehicle.vehicle_type_code ?? "") ?? 0) + x.end.mobilization_minutes + x.end.buffer_minutes) * 6e4
          ).toISOString(),
          roster_sequence: index + 1,
          source_trip_count: 1
        }))
      );
      routes.push({ routeCode: p.header.mst, schedules });
    }
    const summaries = parsed.map((p, i) => ({
      fileName: p.fileName,
      routeCode: p.header.mst,
      rowsRead: p.trips.length,
      vehicles: routes[i].schedules.length,
      status: "valid"
    }));
    if (mode === "preview")
      return NextResponse.json({
        preview: true,
        serviceDate,
        files: summaries,
        missingVehicles: missing,
        message: `\u0110\xE3 \u0111\u1ED1i so\xE1t ${files.length} file, ${routes.length} tuy\u1EBFn. Ch\u01B0a ghi d\u1EEF li\u1EC7u.`
      });
    const { data: result, error: batchError } = await db.rpc(
      "replace_route_rosters_batch",
      { p_daily_plan_id: plan.id, p_routes: routes }
    );
    if (batchError)
      return fail(`Kh\xF4ng th\u1EC3 import h\xE0ng lo\u1EA1t: ${batchError.message}`, 409);
    return NextResponse.json({
      serviceDate,
      files: summaries,
      result,
      addedVehicles: missing,
      message: `\u0110\xE3 import \u0111\u1ED3ng th\u1EDDi ${routes.length} tuy\u1EBFn. To\xE0n b\u1ED9 phi\xEAn \u0111\u01B0\u1EE3c ghi trong m\u1ED9t transaction.`
    });
  } catch (error) {
    return fail(
      error instanceof UnauthenticatedError ? "B\u1EA1n c\u1EA7n \u0111\u0103ng nh\u1EADp l\u1EA1i." : error instanceof Error ? error.message : "Import h\xE0ng lo\u1EA1t th\u1EA5t b\u1EA1i.",
      error instanceof UnauthenticatedError ? 401 : 400
    );
  }
}
export {
  POST
};
