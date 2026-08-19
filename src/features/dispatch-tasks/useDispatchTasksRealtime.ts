'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/infrastructure/supabase/client';
import { authFetch } from '@/infrastructure/auth/authFetch';
import type { TaskStatus, TaskType } from '@/domain/task/taskStateMachine';
export interface DispatchTaskRow { id: string; task_type: TaskType; vehicle_id: string | null; assigned_profile_id: string | null; status: TaskStatus; eta_at: string | null; priority_lct_at: string | null; from_depot_id: string | null; to_station_id: string | null; completed_at: string | null; created_at: string; vehicles?: { license_plate: string } | null; }
export function useDispatchTasksRealtime() {
  const [tasks, setTasks] = useState<DispatchTaskRow[]>([]); const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState<string | null>(null); const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting'); const supabaseRef = useRef(createClient());
  useEffect(() => { const supabase = supabaseRef.current; let mounted = true;
    const load = async () => { try { const response = await authFetch('/api/v1/dashboard/tasks'); const body = await response.json(); if (!mounted) return; if (!response.ok) setLoadError(body.error?.message ?? 'Không thể tải task.'); else { setTasks(body.tasks as DispatchTaskRow[]); setLoadError(null); } } catch { if (mounted) setLoadError('Không thể kết nối máy chủ để tải task.'); } finally { if (mounted) setLoading(false); } };
    void load(); const channel = supabase.channel('dispatch_tasks_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_tasks' }, () => { void load(); }).subscribe((status) => { if (!mounted) return; if (status === 'SUBSCRIBED') setConnectionStatus('connected'); else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnectionStatus('error'); });
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, []);
  return { tasks, loading, loadError, connectionStatus };
}
