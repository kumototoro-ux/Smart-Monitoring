'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { run, must, ActionError } from '@/lib/action';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildRender, NOTICE_BUCKET, sniffImage } from '@/lib/notice-server';
import { NOTICE_IMAGES, normalizeBranch, normalizeNotice, type NoticeData, type NoticeImageKind, type NoticeRender } from '@/lib/notice';

const uuid = z.string().uuid();
const parse = <T>(s: z.ZodType<T>, v: unknown): T => {
  const r = s.safeParse(v);
  if (!r.success) throw new ActionError(r.error.issues[0].message);
  return r.data;
};
const done = () => { revalidatePath('/settings/notices'); revalidatePath('/notices'); };

// ------------------------------------------------------------------ الإعدادات العامة
const bandNum = z.number().min(1).max(100);
const generalSchema = z.object({
  enabled: z.boolean(),
  allow_supervisor: z.boolean(),
  allow_homeroom: z.boolean(),
  header_ar: z.string().trim().min(1, 'اكتبي سطر الترويسة العربي').max(120),
  header_en: z.string().trim().min(1, 'اكتبي سطر الترويسة الإنجليزي').max(120),
  show_basmala: z.boolean(),
  school_en: z.string().trim().max(120),
  year_hijri: z.string().trim().max(40),
  year_greg: z.string().trim().max(40),
  title_ar: z.string().trim().min(5, 'عنوان الإشعار العربي قصير').max(200),
  title_en: z.string().trim().min(5, 'عنوان الإشعار الإنجليزي قصير').max(200),
  show_signature: z.boolean(),
  show_stamp: z.boolean(),
  show_disclaimer: z.boolean(),
  show_footer: z.boolean(),
  show_levels_legend: z.boolean(),
  legends: z.array(z.object({
    id: z.string().max(40), title: z.string().max(60), grades: z.array(z.string().max(80)).max(30),
    items: z.array(z.object({ ar: z.string().max(400), en: z.string().max(400) })).max(10),
    note_ar: z.string().max(400), note_en: z.string().max(400),
  })).max(8).optional(),
  level_en: z.record(z.string().max(60), z.string().trim().max(60)).default({}),
  bands: z.object({ excellent: bandNum, vgood: bandNum, good: bandNum, pass: bandNum }),
}).refine((v) => v.bands.excellent > v.bands.vgood && v.bands.vgood > v.bands.good && v.bands.good > v.bands.pass, { message: 'حدود التقدير يجب أن تتنازل: ممتاز > جيد جداً > جيد > مقبول' });

export async function saveNoticeSettings(input: z.input<typeof generalSchema>) {
  return run('notice.settings', ['admin'], async ({ supabase }) => {
    const v = parse(generalSchema, input);
    const cur = must(await supabase.from('notice_settings').select('data').eq('id', 1).single())?.data;
    const next = normalizeNotice({ ...(cur as object), ...v, images: normalizeNotice(cur).images });
    must(await supabase.from('notice_settings').update({ data: next, updated_at: new Date().toISOString() }).eq('id', 1));
    done();
    return { enabled: next.enabled, allow_supervisor: next.allow_supervisor, allow_homeroom: next.allow_homeroom };
  }, { log: (d) => d });
}

// ------------------------------------------------------------------ إعدادات فرع (المديرة)
const branchSchema = z.object({
  name_en: z.string().trim().max(120),
  principal_gender: z.enum(['m', 'f']),
  principal_title: z.string().trim().max(60),
  principal_title_en: z.string().trim().max(60),
  principal_name: z.string().trim().max(120),
  principal_name_en: z.string().trim().max(120),
  show_signature: z.boolean().nullable(),
  show_stamp: z.boolean().nullable(),
});

export async function saveNoticeBranch(branchId: string, input: z.input<typeof branchSchema>) {
  return run('notice.branch', ['admin'], async ({ supabase }) => {
    const id = parse(uuid, branchId);
    const v = parse(branchSchema, input);
    const cur = must(await supabase.from('notice_branch_settings').select('data').eq('branch_id', id).maybeSingle())?.data;
    const next = normalizeBranch({ ...(cur as object ?? {}), ...v, images: normalizeBranch(cur).images });
    must(await supabase.from('notice_branch_settings').upsert({ branch_id: id, data: next, updated_at: new Date().toISOString() }));
    done();
    return { branch: id };
  }, { log: (d) => d });
}

// ------------------------------------------------------------------ الصور (شعار/رؤية/بسملة/توقيع/ختم)
const MAX_BYTES = 900 * 1024;

/** scope: 'global' أو معرّف فرع. الصور تُحفظ في مخزن خاص، ولا تُقرأ إلا من الخادم */
export async function uploadNoticeImage(fd: FormData) {
  return run('notice.image', ['admin'], async ({ supabase }) => {
    const scope = String(fd.get('scope') ?? '');
    const kind = String(fd.get('kind') ?? '') as NoticeImageKind;
    const file = fd.get('file');
    const meta = NOTICE_IMAGES.find((i) => i.kind === kind);
    if (!meta) throw new ActionError('نوع الصورة غير معروف');
    const isGlobal = scope === 'global';
    if (!isGlobal) parse(uuid, scope);
    if (!isGlobal && !meta.branch) throw new ActionError('هذه الصورة عامة لكل الفروع');
    if (!(file instanceof File) || !file.size) throw new ActionError('اختاري ملف صورة');
    if (file.size > MAX_BYTES) throw new ActionError('حجم الصورة أكبر من 900 كيلوبايت. صغّري الصورة ثم أعيدي الرفع');
    const buf = Buffer.from(await file.arrayBuffer());
    const t = sniffImage(buf);
    if (!t) throw new ActionError('الملف ليس صورة PNG أو JPG أو WEBP');

    const path = `notice/${isGlobal ? 'g' : scope.slice(0, 8)}-${kind}-${Date.now().toString(36)}.${t.ext}`;
    const admin = createAdminClient();
    const up = await admin.storage.from(NOTICE_BUCKET).upload(path, buf, { contentType: t.mime, upsert: false });
    if (up.error) throw new ActionError('تعذّر رفع الصورة. تأكدي من تشغيل ملف 0012 في Supabase');

    let old: string | undefined;
    if (isGlobal) {
      const cur = must(await supabase.from('notice_settings').select('data').eq('id', 1).single())?.data;
      const s = normalizeNotice(cur);
      old = s.images[kind];
      must(await supabase.from('notice_settings').update({ data: { ...s, images: { ...s.images, [kind]: path } }, updated_at: new Date().toISOString() }).eq('id', 1));
    } else {
      const cur = must(await supabase.from('notice_branch_settings').select('data').eq('branch_id', scope).maybeSingle())?.data;
      const b = normalizeBranch(cur);
      old = b.images[kind as 'logo' | 'signature' | 'stamp'];
      must(await supabase.from('notice_branch_settings').upsert({ branch_id: scope, data: { ...b, images: { ...b.images, [kind]: path } }, updated_at: new Date().toISOString() }));
    }
    if (old) await admin.storage.from(NOTICE_BUCKET).remove([old]);
    done();
    return { scope, kind, url: `data:${t.mime};base64,${buf.toString('base64')}` };
  }, { log: (d) => ({ scope: d.scope, kind: d.kind }) });
}

export async function removeNoticeImage(scope: string, kind: NoticeImageKind) {
  return run('notice.image.remove', ['admin'], async ({ supabase }) => {
    const meta = NOTICE_IMAGES.find((i) => i.kind === kind);
    if (!meta) throw new ActionError('نوع الصورة غير معروف');
    const isGlobal = scope === 'global';
    if (!isGlobal) parse(uuid, scope);
    let old: string | undefined;
    if (isGlobal) {
      const s = normalizeNotice(must(await supabase.from('notice_settings').select('data').eq('id', 1).single())?.data);
      old = s.images[kind];
      const images = { ...s.images }; delete images[kind];
      must(await supabase.from('notice_settings').update({ data: { ...s, images } }).eq('id', 1));
    } else {
      const b = normalizeBranch(must(await supabase.from('notice_branch_settings').select('data').eq('branch_id', scope).maybeSingle())?.data);
      const k = kind as 'logo' | 'signature' | 'stamp';
      old = b.images[k];
      const images = { ...b.images }; delete images[k];
      must(await supabase.from('notice_branch_settings').upsert({ branch_id: scope, data: { ...b, images } }));
    }
    if (old) await createAdminClient().storage.from(NOTICE_BUCKET).remove([old]);
    done();
  }, { log: () => ({ scope, kind }) });
}

/** صور الإعدادات (عامة أو لفرع) كروابط data: للمعاينة في صفحة الإعدادات */
export async function loadNoticeAssets(branchId: string | null) {
  return run('notice.assets', ['admin'], async ({ supabase }) => {
    return (await buildRender(supabase, branchId ? parse(uuid, branchId) : null)).brand;
  });
}

// ------------------------------------------------------------------ الأسماء الإنجليزية
const enList = z.array(z.object({ id: uuid, name_en: z.string().trim().max(120) })).max(300);

export async function saveEnglishNames(input: { subjects: { id: string; name_en: string }[]; grades: { id: string; name_en: string }[] }) {
  return run('notice.english', ['admin'], async ({ supabase }) => {
    const subjects = parse(enList, input.subjects);
    const grades = parse(enList, input.grades);
    for (const s of subjects) must(await supabase.from('subjects').update({ name_en: s.name_en || null }).eq('id', s.id));
    for (const g of grades) must(await supabase.from('grades').update({ name_en: g.name_en || null }).eq('id', g.id));
    done();
    return { subjects: subjects.length, grades: grades.length };
  }, { log: (d) => d });
}

// ------------------------------------------------------------------ مربية الفصل (إسناد من الأدمن)
export async function setClassTeacher(sectionId: string, teacherId: string | null) {
  return run('notice.homeroom', ['admin'], async ({ supabase, profile }) => {
    const sec = parse(uuid, sectionId);
    if (!teacherId) {
      must(await supabase.from('class_teachers').delete().eq('section_id', sec));
      done();
      return { section: sec, teacher: null };
    }
    const tid = parse(uuid, teacherId);
    const section = must(await supabase.from('sections').select('branch_id').eq('id', sec).single()) as { branch_id: string };
    const teacher = must(await supabase.from('profiles').select('role, branch_id, is_active').eq('id', tid).single()) as { role: string; branch_id: string | null; is_active: boolean };
    if (teacher.role !== 'teacher' || !teacher.is_active) throw new ActionError('اختاري معلمة نشطة');
    if (teacher.branch_id !== section.branch_id) throw new ActionError('المعلمة من فرع آخر');
    must(await supabase.from('class_teachers').upsert({ section_id: sec, teacher_id: tid, assigned_by: profile.id }));
    must(await supabase.from('sections').update({ homeroom_name: null }).eq('id', sec));
    done();
    return { section: sec, teacher: tid };
  }, { log: (d) => d });
}

/** اسم مربية الفصل بدون حساب: يظهر في الشهادة وسجل الإصدار فقط (للأدمن) */
export async function setClassTeacherName(sectionId: string, name: string) {
  return run('notice.homeroom_name', ['admin'], async ({ supabase }) => {
    const sec = parse(uuid, sectionId);
    const clean = parse(z.string().trim().max(80), name ?? '').replace(/\s+/g, ' ');
    must(await supabase.from('sections').update({ homeroom_name: clean || null }).eq('id', sec));
    done();
    return { section: sec, name: clean || null };
  }, { log: (d) => d });
}

// ------------------------------------------------------------------ الإصدار
/** يضيف متوسط المواظبة والسلوك (إن كانت الميزة مفعّلة ومشغّلة 0020) دون أن يُفشل الإشعار إن لم تتوفر */
async function attachConduct(supabase: import('@supabase/supabase-js').SupabaseClient, list: NoticeData[], term: 1 | 2) {
  if (!list.length) return;
  const { data, error } = await supabase.rpc('notice_conduct', { p_students: list.map((d) => d.student.id), p_term: term });
  if (error || !data) return;
  const map = data as Record<string, { attendance: number | null; behavior: number | null; n: number }>;
  for (const d of list) d.conduct = map[d.student.id] ?? null;
}

export interface NoticeBundle { data: NoticeData; render: NoticeRender }

export async function getNoticeRoster(sectionId: string, term: 1 | 2) {
  return run('notice.roster', ['admin', 'supervisor', 'teacher'], async ({ supabase }) => {
    const r = must(await supabase.rpc('notice_roster', { p_section: parse(uuid, sectionId), p_term: parse(z.union([z.literal(1), z.literal(2)]), term) }));
    return r as { id: string; full_name: string; student_number: string | null; missing: number }[];
  });
}

/**
 * بيانات إشعار طالب. الإعدادات والصور (الأثقل) تُرسل فقط عند الطلب، فيحملها العميل مرة واحدة لكل فرع.
 * التحقق من الصلاحية والاكتمال داخل قاعدة البيانات
 */
export async function loadNotice(studentId: string, term: 1 | 2, withRender = true) {
  return run('notice.load', ['admin', 'supervisor', 'teacher'], async ({ supabase }): Promise<{ data: NoticeData; render: NoticeRender | null }> => {
    const data = must(await supabase.rpc('notice_student', { p_student: parse(uuid, studentId), p_term: parse(z.union([z.literal(1), z.literal(2)]), term) })) as NoticeData;
    await attachConduct(supabase, [data], term);
    return { data, render: withRender ? await buildRender(supabase, data.branch.id) : null };
  }, { context: { student: studentId, term } });
}

/** إشعارات الشعبة كلها دفعة واحدة (أدمن/مشرفة) — بيانات خفيفة بلا صور */
export async function loadNoticeSection(sectionId: string, term: 1 | 2) {
  return run('notice.section', ['admin', 'supervisor'], async ({ supabase }) => {
    const list = must(await supabase.rpc('notice_section', { p_section: parse(uuid, sectionId), p_term: parse(z.union([z.literal(1), z.literal(2)]), term) })) as NoticeData[];
    await attachConduct(supabase, list, term);
    const first = list[0];
    return { list, render: first ? await buildRender(supabase, first.branch.id) : null };
  }, { context: { section: sectionId, term } });
}

type IssueKind = 'pdf' | 'png' | 'share' | 'zip';
const issueKind = z.enum(['pdf', 'png', 'share', 'zip']);
const termSchema = z.union([z.literal(1), z.literal(2)]);

/** يسجّل الإصدار في سجل الإشعارات الدائم. قبل تشغيل 0014 يمرّ بصمت ويبقى أثره في سجل التتبع فقط */
async function logIssue(supabase: import('@supabase/supabase-js').SupabaseClient, ids: string[], term: 1 | 2, kind: IssueKind) {
  const { data, error } = await supabase.rpc('notice_log_issue', { p_students: ids, p_term: term, p_kind: kind });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return null; // الدالة غير موجودة بعد (0014)
    throw error;
  }
  return data as number;
}

/** يسجّل إصدار شعبة كاملة (ملف مضغوط): سجلاً لكل طالب + أثر في سجل التتبع */
export async function logNoticeBatch(sectionId: string, term: 1 | 2, studentIds: string[], skipped: number, kind: 'pdf' | 'png') {
  return run('notice.batch', ['admin', 'supervisor'], async ({ supabase }) => {
    const ids = parse(z.array(uuid).max(300), studentIds);
    const logged = ids.length ? await logIssue(supabase, ids, parse(termSchema, term), 'zip') : 0;
    if (logged === null) must(await supabase.rpc('notice_roster', { p_section: parse(uuid, sectionId), p_term: term })); // تحقق من الصلاحية
    return { section: sectionId, term, count: ids.length, skipped, kind, logged };
  }, { log: (d) => d });
}

/** يسجّل التنزيل/المشاركة بعد نجاحه في المتصفح */
export async function logNoticeIssued(studentId: string, term: 1 | 2, kind: 'pdf' | 'png' | 'share') {
  return run('notice.issued', ['admin', 'supervisor', 'teacher'], async ({ supabase }) => {
    const id = parse(uuid, studentId);
    const logged = await logIssue(supabase, [id], parse(termSchema, term), parse(issueKind, kind));
    if (logged === null) must(await supabase.rpc('notice_student', { p_student: id, p_term: term })); // تحقق من الصلاحية فقط
    return { student_id: id, term, kind, logged };
  }, { log: (d) => d });
}

// ------------------------------------------------------------------ سجل الإصدار (أدمن/مشرفة)
export interface IssueRow {
  id: string; student_id: string | null; student_name: string; student_number: string | null;
  branch_id: string; grade_id: string | null; section_id: string | null; term: number; kind: IssueKind;
  complete: boolean; issuer_name: string | null; issuer_role: string | null; created_at: string;
}
export interface IssueFilter { section?: string; branch?: string; grade?: string; issuer?: string; term: 1 | 2; q?: string; before?: string }

/** صفحات سجل الإصدار (50 صفاً في كل مرة) حسب الفرع/الصف/الشعبة/المُصدِرة */
export async function loadNoticeIssues(f: IssueFilter) {
  return run('notice.issues', ['admin', 'supervisor'], async ({ supabase }) => {
    const opt = (v: unknown) => (v ? parse(uuid, v) : undefined);
    let q = supabase.from('notice_issues')
      .select('id, student_id, student_name, student_number, branch_id, grade_id, section_id, term, kind, complete, issuer_name, issuer_role, created_at')
      .eq('term', parse(termSchema, f.term))
      .order('created_at', { ascending: false }).limit(51);
    const section = opt(f.section), branch = opt(f.branch), grade = opt(f.grade), issuer = opt(f.issuer);
    if (section) q = q.eq('section_id', section);
    if (branch) q = q.eq('branch_id', branch);
    if (grade) q = q.eq('grade_id', grade);
    if (issuer) q = q.eq('issued_by', issuer);
    if (f.before) q = q.lt('created_at', parse(z.string().datetime({ offset: true }), f.before));
    if (f.q?.trim()) q = q.ilike('student_name', `%${f.q.trim().replace(/[%_,()]/g, ' ').slice(0, 60)}%`);
    const rows = must(await q) as IssueRow[];
    return { rows: rows.slice(0, 50), more: rows.length > 50 };
  });
}
