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
export async function shareFile(file: File, text: string): Promise<ShareResult> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name, text });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }
  saveBlob(file, file.name);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  return 'fallback';
}
