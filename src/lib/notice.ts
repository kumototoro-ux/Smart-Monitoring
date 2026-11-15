// إشعار درجات الفصل — الأنواع والحسابات المشتركة بين الخادم والمتصفح (بدون server-only)
import { secLabel } from './utils';

export type NoticeImageKind = 'basmala' | 'logo' | 'vision' | 'signature' | 'stamp';

export const NOTICE_IMAGES: { kind: NoticeImageKind; ar: string; hint: string; branch: boolean }[] = [
  { kind: 'logo', ar: 'شعار المدرسة', hint: 'يظهر تحت البسملة في وسط الترويسة. يمكن لكل فرع شعار خاص به.', branch: true },
  { kind: 'vision', ar: 'شعار الرؤية', hint: 'يظهر في الجهة اليسرى تحت «Kingdom of Saudi Arabia».', branch: false },
  { kind: 'basmala', ar: 'صورة البسملة', hint: 'اختيارية: تحل محل البسملة المكتوبة.', branch: false },
  { kind: 'signature', ar: 'صورة التوقيع', hint: 'PNG بخلفية شفافة. يظهر فقط إن فعّلتِ التوقيع.', branch: true },
  { kind: 'stamp', ar: 'صورة الختم', hint: 'PNG بخلفية شفافة. يظهر فقط إن فعّلتِ الختم.', branch: true },
];

export interface NoticeBands { excellent: number; vgood: number; good: number; pass: number }

/** الإعدادات العامة (صف واحد) */
export interface NoticeSettings {
  /** الإصدار متاح لغير الأدمن؟ */
  enabled: boolean;
  allow_supervisor: boolean;
  allow_homeroom: boolean;
  header_ar: string;
  header_en: string;
  show_basmala: boolean;
  school_en: string;
  year_greg: string;
  /** {الفصل} {الصف} {العام} — و {term} {grade} {year} في الإنجليزي */
  title_ar: string;
  title_en: string;
  show_signature: boolean;
  show_stamp: boolean;
  show_disclaimer: boolean;
  show_footer: boolean;
  bands: NoticeBands;
  /** مسارات الصور في التخزين الخاص */
  images: Partial<Record<NoticeImageKind, string>>;
}

/** إعدادات فرع: المديرة وما يخص الفرع */
export interface NoticeBranch {
  name_en: string;
  principal_gender: 'm' | 'f';
  /** فارغ = مدير الفرع / مديرة الفرع حسب الجنس */
  principal_title: string;
  principal_title_en: string;
  principal_name: string;
  principal_name_en: string;
  /** null = اتباع الإعداد العام */
  show_signature: boolean | null;
  show_stamp: boolean | null;
  images: Partial<Record<'logo' | 'signature' | 'stamp', string>>;
}

export const NOTICE_DEFAULTS: NoticeSettings = {
  enabled: false,
  allow_supervisor: false,
  allow_homeroom: false,
  header_ar: 'المملكة العربية السعودية',
  header_en: 'Kingdom of Saudi Arabia',
  show_basmala: true,
  school_en: '',
  year_greg: '',
  title_ar: 'إشعار درجات الفصل الدراسي {الفصل} — {الصف} — للعام الدراسي {العام}',
  title_en: '{term} Term Grade Notice – {grade} – Academic Year {year}',
  show_signature: false,
  show_stamp: false,
  show_disclaimer: true,
  show_footer: true,
  bands: { excellent: 90, vgood: 80, good: 70, pass: 60 },
  images: {},
};

export const BRANCH_DEFAULTS: NoticeBranch = {
  name_en: '',
  principal_gender: 'f',
  principal_title: '',
  principal_title_en: '',
  principal_name: '',
  principal_name_en: '',
  show_signature: null,
  show_stamp: null,
  images: {},
};

const str = (v: unknown, max: number, d = '') => (typeof v === 'string' ? v.slice(0, max) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const path = (v: unknown) => (typeof v === 'string' && /^notice\/[\w.-]+$/.test(v) ? v : undefined);

export function normalizeNotice(raw: unknown): NoticeSettings {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const D = NOTICE_DEFAULTS;
  const images: NoticeSettings['images'] = {};
  const im = (v.images && typeof v.images === 'object' ? v.images : {}) as Record<string, unknown>;
  for (const { kind } of NOTICE_IMAGES) { const p = path(im[kind]); if (p) images[kind] = p; }
  const b = (v.bands && typeof v.bands === 'object' ? v.bands : {}) as Record<string, unknown>;
  const n = (x: unknown, d: number) => { const k = Number(x); return Number.isFinite(k) && k > 0 && k <= 100 ? k : d; };
  return {
    enabled: bool(v.enabled, D.enabled),
    allow_supervisor: bool(v.allow_supervisor, D.allow_supervisor),
    allow_homeroom: bool(v.allow_homeroom, D.allow_homeroom),
    header_ar: str(v.header_ar, 120, D.header_ar).trim() || D.header_ar,
    header_en: str(v.header_en, 120, D.header_en).trim() || D.header_en,
    show_basmala: bool(v.show_basmala, D.show_basmala),
    school_en: str(v.school_en, 120),
    year_greg: str(v.year_greg, 40),
    title_ar: str(v.title_ar, 200, D.title_ar).trim() || D.title_ar,
    title_en: str(v.title_en, 200, D.title_en).trim() || D.title_en,
    show_signature: bool(v.show_signature, D.show_signature),
    show_stamp: bool(v.show_stamp, D.show_stamp),
    show_disclaimer: bool(v.show_disclaimer, D.show_disclaimer),
    show_footer: bool(v.show_footer, D.show_footer),
    bands: { excellent: n(b.excellent, 90), vgood: n(b.vgood, 80), good: n(b.good, 70), pass: n(b.pass, 60) },
    images,
  };
}

export function normalizeBranch(raw: unknown): NoticeBranch {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const images: NoticeBranch['images'] = {};
  const im = (v.images && typeof v.images === 'object' ? v.images : {}) as Record<string, unknown>;
  for (const k of ['logo', 'signature', 'stamp'] as const) { const p = path(im[k]); if (p) images[k] = p; }
  const tri = (x: unknown) => (typeof x === 'boolean' ? x : null);
  return {
    name_en: str(v.name_en, 120),
    principal_gender: v.principal_gender === 'm' ? 'm' : 'f',
    principal_title: str(v.principal_title, 60),
    principal_title_en: str(v.principal_title_en, 60),
    principal_name: str(v.principal_name, 120),
    principal_name_en: str(v.principal_name_en, 120),
    show_signature: tri(v.show_signature),
    show_stamp: tri(v.show_stamp),
    images,
  };
}

/** الصور بعد تحويلها لروابط data: ليلتقطها المصدّر دون مشاكل CORS */
export type NoticeBrand = Partial<Record<NoticeImageKind, string>>;

/** ما يحتاجه الرسم بعد دمج العام + الفرع */
export interface NoticeRender {
  settings: NoticeSettings;
  branch: NoticeBranch;
  brand: NoticeBrand;
  showSignature: boolean;
  showStamp: boolean;
}

export function resolveRender(settings: NoticeSettings, branch: NoticeBranch, brand: NoticeBrand): NoticeRender {
  return {
    settings, branch, brand,
    showSignature: branch.show_signature ?? settings.show_signature,
    showStamp: branch.show_stamp ?? settings.show_stamp,
  };
}

/* ------------------------------ بيانات الإشعار من قاعدة البيانات ------------------------------ */
export interface NoticeSubject {
  id: string; name: string; name_en: string | null;
  max: number; total: number | null; recorded: number; comps: number; absent: boolean | null; level: string | null;
}
export interface NoticeData {
  student: { id: string; name: string; name_en: string | null; national_id: string | null; number: string | null; birth_date: string | null; nationality: string | null; gender: string | null };
  branch: { id: string; name: string; code: string | null };
  grade: { name: string; name_en: string | null; mode: 'numeric' | 'verbal'; stage: string | null };
  section: string;
  homeroom: string | null;
  term: 1 | 2;
  year: string;
  school: string;
  missing: { subject: string; teacher: string | null }[];
  complete: boolean;
  subjects: NoticeSubject[];
}

export interface Rating { ar: string; en: string }
export function rate(p: number | null | undefined, b: NoticeBands): Rating | null {
  if (p == null || Number.isNaN(p)) return null;
  if (p >= b.excellent) return { ar: 'ممتاز', en: 'Excellent' };
  if (p >= b.vgood) return { ar: 'جيد جدًا', en: 'Very Good' };
  if (p >= b.good) return { ar: 'جيد', en: 'Good' };
  if (p >= b.pass) return { ar: 'مقبول', en: 'Pass' };
  return { ar: 'ضعيف', en: 'Weak' };
}

export const fmtNum = (v: number | null | undefined) => (v == null ? '' : String(Math.round(Number(v) * 100) / 100));

export const TERM_AR = { 1: 'الأول', 2: 'الثاني' } as const;
export const TERM_EN = { 1: 'First', 2: 'Second' } as const;

export function fillTitle(tpl: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), tpl);
}

export function titles(d: NoticeData, s: NoticeSettings) {
  const gradeAr = [d.grade.name, d.section && d.section !== 'عام' ? secLabel(d.section) : ''].filter(Boolean).join(' / ');
  return {
    ar: fillTitle(s.title_ar, { الفصل: TERM_AR[d.term], الصف: d.grade.name, العام: d.year }),
    en: d.grade.name_en ? fillTitle(s.title_en, { term: TERM_EN[d.term], grade: d.grade.name_en, year: s.year_greg || d.year }) : '',
    gradeSection: gradeAr,
  };
}

export function principalTitle(b: NoticeBranch) {
  return {
    ar: b.principal_title.trim() || (b.principal_gender === 'f' ? 'مديرة الفرع' : 'مدير الفرع'),
    en: b.principal_title_en.trim() || (b.principal_gender === 'f' ? 'Branch Principal' : 'Branch Principal'),
  };
}

/** ملخص الإشعار: المجموع والمعدل والتقدير العام (للرصد الرقمي فقط) */
export function summarize(d: NoticeData, bands: NoticeBands) {
  if (d.grade.mode === 'verbal') return null;
  const rows = d.subjects.filter((s) => s.max > 0 && s.total != null);
  const total = rows.reduce((a, s) => a + Number(s.total), 0);
  const max = rows.reduce((a, s) => a + Number(s.max), 0);
  const avg = max > 0 ? (total / max) * 100 : null;
  return { total, max, avg, rating: rate(avg, bands) };
}

export const noticeFileName = (d: NoticeData) =>
  `إشعار-${d.student.name}-الفصل-${TERM_AR[d.term]}`.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').slice(0, 120);
