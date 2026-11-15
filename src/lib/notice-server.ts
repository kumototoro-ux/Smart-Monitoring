import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './supabase/admin';
import {
  normalizeBranch, normalizeNotice, resolveRender,
  type NoticeBrand, type NoticeImageKind, type NoticeRender,
} from './notice';

export const NOTICE_BUCKET = 'notice-assets';

/** صورة من المخزن الخاص كرابط data: (ليلتقطها المصدّر دون CORS) */
async function dataUrl(path: string | undefined): Promise<string | undefined> {
  if (!path) return undefined;
  try {
    const { data, error } = await createAdminClient().storage.from(NOTICE_BUCKET).download(path);
    if (error || !data) return undefined;
    const buf = Buffer.from(await data.arrayBuffer());
    return `data:${data.type || 'image/png'};base64,${buf.toString('base64')}`;
  } catch {
    return undefined;
  }
}

/**
 * يجمع إعدادات الإشعار العامة وإعدادات الفرع وصورهما.
 * مهم: يُستدعى فقط بعد التحقق من صلاحية المستخدم (الصور تُقرأ بصلاحية الخادم).
 * صورة الفرع تغلب الصورة العامة (الشعار والتوقيع والختم).
 */
export async function buildRender(supabase: SupabaseClient, branchId: string | null): Promise<NoticeRender> {
  const [{ data: g }, { data: b }] = await Promise.all([
    supabase.from('notice_settings').select('data').eq('id', 1).maybeSingle(),
    branchId ? supabase.from('notice_branch_settings').select('data').eq('branch_id', branchId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const settings = normalizeNotice(g?.data);
  const branch = normalizeBranch(b?.data);
  const pick = (k: 'logo' | 'signature' | 'stamp') => branch.images[k] ?? settings.images[k];
  const [logo, signature, stamp, vision, basmala] = await Promise.all([
    dataUrl(pick('logo')), dataUrl(pick('signature')), dataUrl(pick('stamp')),
    dataUrl(settings.images.vision), settings.show_basmala ? dataUrl(settings.images.basmala) : Promise.resolve(undefined),
  ]);
  const brand: NoticeBrand = {};
  const set = (k: NoticeImageKind, v: string | undefined) => { if (v) brand[k] = v; };
  set('logo', logo); set('signature', signature); set('stamp', stamp); set('vision', vision); set('basmala', basmala);
  return resolveRender(settings, branch, brand);
}

const MAGIC: [string, number[]][] = [
  ['image/png', [0x89, 0x50, 0x4e, 0x47]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
];
/** يتحقق من نوع الصورة الفعلي من أول بايتات الملف، لا من اسمه */
export function sniffImage(buf: Buffer): { mime: string; ext: string } | null {
  for (const [mime, sig] of MAGIC) if (sig.every((b, i) => buf[i] === b)) return { mime, ext: mime === 'image/png' ? 'png' : 'jpg' };
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}
