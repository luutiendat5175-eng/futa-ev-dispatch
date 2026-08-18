import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/infrastructure/supabase/server';
import { getCurrentUserContext } from '@/infrastructure/auth/getCurrentUserContext';

/** Vehicle master list for QR printing. Uses the server client so RLS cannot
 * accidentally return an empty list to a permitted admin/dispatcher. */
export async function GET() {
  try {
    await getCurrentUserContext();
    const { data, error } = await createServiceRoleClient().from('vehicles').select('id,license_plate,vehicle_type_code').eq('is_active', true).order('license_plate');
    if (error) throw error;
    return NextResponse.json({ vehicles: data ?? [] });
  } catch (caught) { return NextResponse.json({ error: { message: caught instanceof Error ? caught.message : 'Không tải được danh sách xe.' } }, { status: 400 }); }
}
