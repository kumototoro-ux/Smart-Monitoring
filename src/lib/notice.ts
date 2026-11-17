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
  /** العام الدراسي الهجري كما يظهر في الإشعار (فارغ = عام النظام) */
  year_hijri: string;
  year_greg: string;
  /** {الفصل} {الصف} {العام} — و {term} {grade} {year} في الإنجليزي */
  title_ar: string;
  title_en: string;
  show_signature: boolean;
  show_stamp: boolean;
  show_disclaimer: boolean;
  show_footer: boolean;
  /** شرح مستويات التقييم اللفظي أسفل الجدول */
  show_levels_legend: boolean;
  /** نصوص شرح المستويات لكل مجموعة صفوف (قابلة للتعديل) */
  legends: LevelLegend[];
  /** ترجمة مستويات التقييم اللفظي: النص العربي ← الإنجليزي (تغلب الترجمة المضمّنة) */
  level_en: Record<string, string>;
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

/** شرح مستويات الطالب أسفل جدول التقييم اللفظي: مجموعة شروح، لكل مجموعة صفوفها ونصها (يعدّلها الأدمن) */
export interface LevelLegend {
  id: string;
  title: string;
  /** أسماء الصفوف المشمولة. فارغ = كل الصفوف اللفظية التي لا يشملها شرح آخر */
  grades: string[];
  items: { ar: string; en: string }[];
  note_ar: string;
  note_en: string;
}

export const DEFAULT_LEGENDS: LevelLegend[] = [
  {
    id: 'kg', title: 'التمهيدي', grades: ['التمهيدي الأول', 'التمهيدي الثاني', 'التمهيدي الثالث'],
    items: [
      { ar: 'متفوق: أتقن الطالب المهارات المستهدفة في المادة بدرجة عالية، ويؤديها باستقلالية وتميّز.', en: 'Excelling: The student has mastered the targeted skills with a high level of proficiency, performing them independently and with distinction.' },
      { ar: 'متقدم: أتقن الطالب معظم المهارات المستهدفة في المادة، ويؤديها باستقلالية مع حاجة محدودة إلى التوجيه.', en: 'Proficient: The student has mastered most of the targeted skills, performing them independently with minimal guidance.' },
      { ar: 'متمكن دائمًا: يؤدي الطالب المهارات المستهدفة بشكل صحيح ومتكرر في مختلف المواقف.', en: 'Consistently Developing: The student performs the targeted skills correctly and consistently across different situations.' },
      { ar: 'متمكن أحيانًا: يؤدي الطالب المهارات المستهدفة بشكل صحيح في بعض المواقف، ويحتاج إلى مزيد من التدريب لتثبيتها.', en: 'Occasionally Developing: The student performs the targeted skills correctly in some situations and needs more practice to consolidate them.' },
      { ar: 'يحتاج دعم: لم يتقن الطالب المهارات المستهدفة بعد، ويحتاج إلى دعم وتوجيه مستمرين.', en: 'Needs Support: The student has not yet mastered the targeted skills and needs continuous support and guidance.' },
    ],
    note_ar: 'يُستخدم هذا التقييم لقياس مدى تحقق الطالب من المهارات المستهدفة في مرحلة رياض الأطفال (التمهيدي).',
    note_en: 'This evaluation is used to measure the student’s attainment of the targeted skills in the kindergarten stage.',
  },
  {
    id: 'primary', title: 'الابتدائي (الأول والثاني)', grades: [],
    items: [
      { ar: 'متفوق: أنجز الطالب 95٪ فأكثر من معايير المادة، مع إتقان 100٪ لمعايير الحد الأدنى.', en: 'Excelling: The student has achieved 95% or more of the subject standards, with 100% mastery of the minimum required standards.' },
      { ar: 'متقدم: أنجز الطالب من 85٪ إلى أقل من 95٪ من معايير المادة، مع إتقان من 90٪ إلى أقل من 100٪ لمعايير الحد الأدنى.', en: 'Proficient: The student has achieved 85% to less than 95% of the subject standards, with 90% to less than 100% mastery of the minimum required standards.' },
      { ar: 'متمكن: أنجز الطالب من 75٪ إلى أقل من 85٪ من معايير المادة، مع إتقان من 80٪ إلى أقل من 90٪ لمعايير الحد الأدنى.', en: 'Developing: The student has achieved 75% to less than 85% of the subject standards, with 80% to less than 90% mastery of the minimum required standards.' },
      { ar: 'غير مجتاز: إنجاز الطالب أقل من 75٪ من معايير المادة أو لم يجتز معيارًا أو أكثر من معايير الحد الأدنى.', en: 'Not Achieved: The student has achieved less than 75% of the subject standards or did not meet one or more of the minimum required standards.' },
    ],
    note_ar: 'يُستخدم هذا التقييم لقياس مدى تحقق الطالب من معايير المادة في المرحلة الابتدائية.',
    note_en: 'This evaluation is used to measure the student’s attainment of subject standards in the primary stage.',
  },
];

export const NOTICE_DEFAULTS: NoticeSettings = {
  enabled: false,
  allow_supervisor: false,
  allow_homeroom: false,
  header_ar: 'المملكة العربية السعودية',
  header_en: 'Kingdom of Saudi Arabia',
  show_basmala: true,
  school_en: '',
  year_hijri: '',
  year_greg: '',
  title_ar: 'إشعار درجات الفصل الدراسي {الفصل} — {الصف} — للعام الدراسي {العام}',
  title_en: '{term} Term Grade Notice – {grade} – Academic Year {year}',
  show_signature: false,
  show_stamp: false,
  show_disclaimer: true,
  show_footer: true,
  show_levels_legend: true,
  legends: DEFAULT_LEGENDS,
  level_en: {},
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

function normLevels(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object')
    for (const [k, val] of Object.entries(raw as Record<string, unknown>).slice(0, 40)) {
      const en = typeof val === 'string' ? val.trim().slice(0, 60) : '';
      if (en) out[k.slice(0, 60)] = en;
    }
  return out;
}

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
    year_hijri: str(v.year_hijri, 40),
    year_greg: str(v.year_greg, 40),
    title_ar: str(v.title_ar, 200, D.title_ar).trim() || D.title_ar,
    title_en: str(v.title_en, 200, D.title_en).trim() || D.title_en,
    show_signature: bool(v.show_signature, D.show_signature),
    show_stamp: bool(v.show_stamp, D.show_stamp),
    show_disclaimer: bool(v.show_disclaimer, D.show_disclaimer),
    show_footer: bool(v.show_footer, D.show_footer),
    show_levels_legend: bool(v.show_levels_legend, D.show_levels_legend),
    legends: normLegends(v.legends),
    level_en: normLevels(v.level_en),
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
    ar: fillTitle(s.title_ar, { الفصل: TERM_AR[d.term], الصف: d.grade.name, العام: s.year_hijri || d.year }),
    en: d.grade.name_en ? fillTitle(s.title_en, { term: TERM_EN[d.term], grade: d.grade.name_en, year: s.year_greg || s.year_hijri || d.year }) : '',
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

/* ------------------------------ التقييم اللفظي ------------------------------ */
const norm = (t: string) => t.replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();

/** الترجمة المضمّنة لمستويات التقييم اللفظي الشائعة */
const BUILTIN_LEVEL_EN: [string, string][] = [
  ['متفوق', 'Excelling'], ['متقدم', 'Proficient'], ['متمكن', 'Developing'], ['غير مجتاز', 'Not Achieved'],
  ['ممتاز', 'Excellent'], ['جيد جدا', 'Very Good'], ['جيد', 'Good'], ['مقبول', 'Pass'], ['يحتاج الي دعم', 'Needs Support'], ['يحتاج دعم', 'Needs Support'],
];

/** الترجمة الإنجليزية لمستوى لفظي: ما حدّده الأدمن أولاً، ثم المضمّنة */
export function levelEn(label: string | null | undefined, s: NoticeSettings): string {
  if (!label) return '';
  const own = s.level_en[label] ?? Object.entries(s.level_en).find(([k]) => norm(k) === norm(label))?.[1];
  if (own) return own;
  return BUILTIN_LEVEL_EN.find(([k]) => norm(k) === norm(label))?.[1] ?? '';
}

function normLegends(raw: unknown): LevelLegend[] {
  if (!Array.isArray(raw)) return DEFAULT_LEGENDS.map((l) => ({ ...l, grades: [...l.grades], items: l.items.map((i) => ({ ...i })) }));
  return raw.slice(0, 8).map((x, i) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const items = (Array.isArray(o.items) ? o.items : []).slice(0, 10).map((it) => {
      const q = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
      return { ar: str(q.ar, 400).trim(), en: str(q.en, 400).trim() };
    }).filter((it) => it.ar || it.en);
    return {
      id: str(o.id, 40).trim() || `l${i + 1}`,
      title: str(o.title, 60).trim() || `شرح ${i + 1}`,
      grades: (Array.isArray(o.grades) ? o.grades : []).filter((g): g is string => typeof g === 'string').slice(0, 30).map((g) => g.slice(0, 80)),
      items, note_ar: str(o.note_ar, 400).trim(), note_en: str(o.note_en, 400).trim(),
    };
  });
}

/** الشرح المناسب لصف: الذي سُمّي فيه الصف أولاً، ثم الشامل (بلا صفوف محددة)، وإلا لا شرح */
export function legendFor(s: NoticeSettings, gradeName: string): LevelLegend | null {
  const n = norm(gradeName);
  const hit = s.legends.find((l) => l.grades.some((g) => norm(g) === n)) ?? s.legends.find((l) => l.grades.length === 0);
  return hit && (hit.items.length || hit.note_ar || hit.note_en) ? hit : null;
}

/** مقاس صفحة الإشعار (A4 بالبكسل) */
export const NOTICE_W = 794;
export const NOTICE_H = 1123;
