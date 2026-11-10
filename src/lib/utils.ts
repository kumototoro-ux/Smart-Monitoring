import clsx, { type ClassValue } from 'clsx';

export const cn = (...v: ClassValue[]) => clsx(v);

// المنطقة الزمنية ثابتة: الخادم (UTC) والمتصفح يرسمان التاريخ بنفس الشكل، وإلا ظهر خطأ React #418
export const APP_TZ = 'Asia/Riyadh';
const ar = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: APP_TZ,
});
const arDate = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'short', day: 'numeric', timeZone: APP_TZ });

/** رقم مؤقت أنشأه النظام لطالب ليس له رقم أكاديمي (مثل TMP-000123) */
export const isTempNumber = (n?: string | null) => !!n && /^TMP-\d+$/.test(n);

export const fmtDateTime = (d?: string | null) => (d ? ar.format(new Date(d)) : '—');
export const fmtDate = (d?: string | null) => (d ? arDate.format(new Date(d)) : '—');

/** الوقت المتبقي بصيغة مختصرة */
export function timeLeft(until: string | null | undefined) {
  if (!until) return null;
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)} يوم`;
  if (h >= 1) return `${h} ساعة`;
  return `${Math.max(1, Math.floor(ms / 60_000))} دقيقة`;
}

/** تحويل الأرقام العربية/الفارسية إلى إنجليزية */
export function normalizeDigits(s: string) {
  return s
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٫,]/g, '.');
}

/** توليد كلمة مرور سهلة القراءة (بدون أحرف ملتبسة) */
export function generatePassword(len = 8) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

/** التمرير لأعلى منطقة المحتوى (تعمل في الجوال والكمبيوتر) */
export function scrollAppTop(smooth = true) {
  const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto';
  document.getElementById('app-scroll')?.scrollTo({ top: 0, behavior });
  window.scrollTo({ top: 0, behavior });
}

/** الاسم الأول مع مراعاة الأسماء المركبة: عبد الله، أبو بكر، نور الهدى */
export function firstName(full: string) {
  const w = full.trim().split(/\s+/);
  if (w.length > 1 && /^(عبد|أبو|ابو|أم|ام)$/.test(w[0])) return `${w[0]} ${w[1]}`;
  if (w.length > 1 && /^(الدين|الله|الرحمن|الهدى)$/.test(w[1])) return `${w[0]} ${w[1]}`;
  return w[0] ?? '';
}

/** الصف الذي ليس له شعب يُنشأ له شعبة واحدة باسم «عام» */
export const GENERAL_SECTION = 'عام';
/** «شعبة أ» — أو «عام» للصف الواحد */
export const secLabel = (name?: string | null) => (!name ? '' : name === GENERAL_SECTION ? GENERAL_SECTION : `شعبة ${name}`);

/** «منذ 3 دقائق» بالعربية */
export function timeAgo(iso: string | number | Date | null | undefined) {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'منذ لحظات';
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? 'منذ دقيقة' : m === 2 ? 'منذ دقيقتين' : m <= 10 ? `منذ ${m} دقائق` : `منذ ${m} دقيقة`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? 'منذ ساعة' : h === 2 ? 'منذ ساعتين' : h <= 10 ? `منذ ${h} ساعات` : `منذ ${h} ساعة`;
  const d = Math.round(h / 24);
  return d === 1 ? 'منذ يوم' : d === 2 ? 'منذ يومين' : d <= 10 ? `منذ ${d} أيام` : `منذ ${d} يوماً`;
}
