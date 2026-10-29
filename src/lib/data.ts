import 'server-only';
import { cache } from 'react';
import { createClient } from './supabase/server';
import type { Settings } from './types';

export const getSettings = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('settings')
    .select('school_name, academic_year, current_term, grading_open, edit_window_days, unlock_hours')
    .eq('id', 1)
    .single<Settings>();
  return data ?? {
    school_name: 'مدارس دار الهدى', academic_year: '—', current_term: 1 as const,
    grading_open: false, edit_window_days: 3, unlock_hours: 48,
  };
});

export interface DashboardStats {
  sheets_total: number; sheets_done: number; students: number; teachers: number;
  pending_requests: number; term: number; year: string; grading_open: boolean;
}

export const getStats = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.rpc('dashboard_stats');
  return data as DashboardStats | null;
});

/** نص خطأ مفهوم من خطأ Supabase */
export function dbMessage(e: { message?: string; hint?: string; code?: string } | null | undefined, fallback = 'حدث خطأ غير متوقع') {
  if (!e) return fallback;
  if (e.code === '23505') return 'هذه البيانات مسجّلة مسبقاً';
  if (e.code === '23503') return 'لا يمكن الحذف لوجود بيانات مرتبطة';
  if (e.code === '42501') return 'غير مصرّح لك بهذه العملية';
  // رسائل دوالنا عربية أصلاً
  if (e.message && /[؀-ۿ]/.test(e.message)) return e.message;
  return fallback;
}
