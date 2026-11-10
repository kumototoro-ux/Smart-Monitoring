'use client';
import { createClient } from '@/lib/supabase/client';

/** مزامنة مسودة الرصد مع السيرفر (جدول sheet_drafts). تعمل من المتصفح مباشرة بصلاحيات RLS. */
export type DraftCell = { raw: string; absent: boolean; level: string | null };
export type DraftValues = Record<string, DraftCell>;
export interface DraftKey { teacher_id: string; section_id: string; grade_subject_id: string; term: 1 | 2; academic_year: string }
export interface ServerDraft { values: DraftValues; filled: number; total: number; base_sig: string | null; device_id: string | null; device_label: string | null; updated_at: string }

const DEVICE = 'mirqat:device';

/** معرّف عشوائي لهذا المتصفح، لمعرفة أن المسودة جاءت من جهاز آخر */
export function deviceId(): string {
  try {
    let d = localStorage.getItem(DEVICE);
    if (!d) { d = crypto.randomUUID(); localStorage.setItem(DEVICE, d); }
    return d;
  } catch { return 'unknown'; }
}
export function deviceLabel(): string {
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'جوال' : 'حاسوب';
}

const isEmpty = (c: DraftCell) => !c.raw.trim() && !c.absent && !c.level;
/** نرسل الخانات غير الفارغة فقط (يقلل الحجم كثيراً) */
export function compact(values: DraftValues): DraftValues {
  const out: DraftValues = {};
  for (const [k, c] of Object.entries(values)) if (!isEmpty(c)) out[k] = c;
  return out;
}

export async function fetchServerDraft(key: Omit<DraftKey, 'academic_year'>): Promise<ServerDraft | null> {
  const { data, error } = await createClient().from('sheet_drafts')
    .select('payload, filled, total, base_sig, device_id, device_label, updated_at')
    .eq('teacher_id', key.teacher_id).eq('section_id', key.section_id)
    .eq('grade_subject_id', key.grade_subject_id).eq('term', key.term).maybeSingle();
  if (error || !data) return null;
  return { values: (data.payload ?? {}) as DraftValues, filled: data.filled, total: data.total, base_sig: data.base_sig, device_id: data.device_id, device_label: data.device_label, updated_at: data.updated_at };
}

/** upsert بصف واحد لكل كشف. keepalive لتصل حتى لو أُغلقت الصفحة */
export async function putServerDraft(key: DraftKey, values: DraftValues, stats: { filled: number; total: number }, baseSig: string, keepalive = false): Promise<boolean> {
  try {
    const { data: { session } } = await createClient().auth.getSession();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!session || !url || !apikey) return false;
    const body = JSON.stringify({
      ...key, payload: compact(values), filled: stats.filled, total: stats.total,
      base_sig: baseSig, device_id: deviceId(), device_label: deviceLabel(),
    });
    if (body.length > 200_000) return false; // الحد في القاعدة 256KB
    const res = await fetch(`${url}/rest/v1/sheet_drafts?on_conflict=teacher_id,section_id,grade_subject_id,term`, {
      method: 'POST', keepalive,
      headers: { 'Content-Type': 'application/json', apikey, Authorization: `Bearer ${session.access_token}`, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body,
    });
    return res.ok;
  } catch { return false; }
}

export async function deleteServerDraft(key: Omit<DraftKey, 'academic_year'>): Promise<void> {
  try {
    await createClient().from('sheet_drafts').delete()
      .eq('teacher_id', key.teacher_id).eq('section_id', key.section_id)
      .eq('grade_subject_id', key.grade_subject_id).eq('term', key.term);
  } catch { /* لا يعطّل الرصد */ }
}
