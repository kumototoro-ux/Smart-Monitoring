// تصدير الإشعار: التقاط الصورة، PDF، تنزيل، ومشاركة (واتساب) — كله في المتصفح
import { NOTICE_W } from '@/lib/notice';

export interface Captured { png: Blob; h: number }

let fontCss: Promise<string> | null = null;
let warmed = false;

/** خطوط الصفحة تُحوَّل مرة واحدة فقط (هذا أبطأ جزء في html-to-image إذا تكرر لكل إشعار) */
async function fonts(node: HTMLElement) {
  const { getFontEmbedCSS } = await import('html-to-image');
  fontCss ??= getFontEmbedCSS(node).catch(() => '');
  return fontCss;
}

/** يلتقط عقدة الإشعار PNG بدقة مضاعفة */
export async function capture(node: HTMLElement): Promise<Captured> {
  const { toBlob } = await import('html-to-image');
  await document.fonts.ready;
  const opts = {
    pixelRatio: 2, backgroundColor: '#ffffff', width: NOTICE_W, height: node.offsetHeight,
    style: { transform: 'none' }, fontEmbedCSS: await fonts(node),
  };
  // تمريرة تهيئة للخطوط والصور مرة واحدة في الجلسة (Safari)
  if (!warmed) { warmed = true; await toBlob(node, opts).catch(() => null); }
  const png = await toBlob(node, opts);
  if (!png) throw new Error('capture failed');
  return { png, h: node.offsetHeight };
}

/** PNG ← JPEG عالي الجودة (حجم PDF أصغر بكثير) */
export async function pngToJpeg(png: Blob): Promise<string> {
  const bmp = await createImageBitmap(png);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0);
  return c.toDataURL('image/jpeg', 0.92);
}

export async function makePdf(cap: Captured, title: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const jpeg = await pngToJpeg(cap.png);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  let w = 210; let hh = (cap.h / NOTICE_W) * 210;
  if (hh > 297) { w = (297 / hh) * 210; hh = 297; }
  pdf.addImage(jpeg, 'JPEG', (210 - w) / 2, 0, w, hh, undefined, 'FAST');
  pdf.setProperties({ title, creator: 'مِرقاة للرصد الذكي' });
  return pdf.output('blob');
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export type ShareResult = 'shared' | 'cancelled' | 'fallback';

/**
 * مشاركة الملف عبر قائمة المشاركة في الجهاز (واتساب وغيره).
 * إن لم يدعمها المتصفح (غالباً الكمبيوتر): ينزّل الملف ويفتح واتساب برسالة جاهزة لإرفاقه.
 * يجب استدعاؤها مباشرة من ضغطة المستخدم، ويكون الملف جاهزاً مسبقاً
 */
/** سبب آخر فشل في المشاركة المباشرة (للتشخيص في رسالة التنبيه) */
export let lastShareError = '';

export async function shareFile(file: File, text: string): Promise<ShareResult> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  lastShareError = '';
  if (typeof nav.share === 'function') {
    // الملف وحده بلا عنوان ولا نص: بعض المتصفحات والتطبيقات تُسقط الملف أو ترفض الطلب إن اقترن بنص
    try {
      await nav.share({ files: [file] });
      return 'shared';
    } catch (e) {
      const name = (e as DOMException)?.name || 'Error';
      if (name === 'AbortError') return 'cancelled';
      logNoticeFailure('share', e, { fileType: file.type, size: file.size });
      lastShareError = `${name}${nav.canShare?.({ files: [file] }) === false ? ' (غير مدعوم)' : ''}`;
    }
    saveBlob(file, file.name);
    return 'fallback'; // المتصفح يدعم المشاركة لكنها فشلت: لا نخرج من الصفحة، نُنزّل الملف ونُظهر السبب
  }
  // لا مشاركة أصلاً (غالباً كمبيوتر): ننزّل الملف ونفتح واتساب برسالة جاهزة
  lastShareError = 'المتصفح لا يدعم المشاركة';
  saveBlob(file, file.name);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  return 'fallback';
}

/** يسجّل فشل التنزيل/المشاركة/التجهيز في سجل التتبع (صفحة سجل التتبع) ليتابعه الأدمن */
export function logNoticeFailure(what: string, err: unknown, extra: Record<string, unknown> = {}) {
  try {
    const e = err as { name?: string; message?: string } | undefined;
    void import('@/lib/supabase/client').then(({ createClient }) =>
      createClient().rpc('log_client_event', {
        p_action: `notice.${what}`,
        p_severity: 'error',
        p_details: { message: String(e?.message ?? err ?? '').slice(0, 300), name: e?.name, ua: navigator.userAgent.slice(0, 160), path: location.pathname, ...extra },
      }).then(() => {}, () => {}));
  } catch { /* التسجيل لا يعطّل المستخدم */ }
}
