'use server';
import { z } from 'zod';
import { run, must, ActionError } from '@/lib/action';
import type { AssessmentMode } from '@/lib/types';

const name = z.string().trim().min(1, 'الاسم مطلوب').max(120);
const uuid = z.string().uuid();
const parse = <T>(s: z.ZodType<T>, v: unknown): T => {
  const r = s.safeParse(v);
  if (!r.success) throw new ActionError(r.error.issues[0].message);
  return r.data;
};

// ------------------------------------------------------------------ الإعدادات
const settingsSchema = z.object({
  school_name: name,
  academic_year: z.string().trim().min(2).max(30),
  current_term: z.union([z.literal(1), z.literal(2)]),
  grading_open: z.boolean(),
  edit_window_days: z.number().int().min(0).max(60),
  unlock_hours: z.number().int().min(1).max(720),
});

export async function updateSettings(input: z.input<typeof settingsSchema>) {
  return run('settings.update', ['admin'], async ({ supabase }) => {
    const v = parse(settingsSchema, input);
    must(await supabase.from('settings').update(v).eq('id', 1));
    return v;
  }, { revalidate: ['/'], log: (v) => v });
}

// ------------------------------------------------------------------ الفروع
const branchSchema = z.object({
  id: uuid.optional(),
  name,
  code: z.string().trim().max(20).optional().transform((v) => v || null),
  is_active: z.boolean().default(true),
});

export async function saveBranch(input: z.input<typeof branchSchema>) {
  return run('branch.save', ['admin'], async ({ supabase }) => {
    const { id, ...v } = parse(branchSchema, input);
    if (id) must(await supabase.from('branches').update(v).eq('id', id));
    else must(await supabase.from('branches').insert(v));
    return v.name;
  }, { revalidate: ['/settings'], log: (n) => ({ name: n }) });
}

export async function deleteBranch(id: string) {
  return run('branch.delete', ['admin'], async ({ supabase }) => {
    must(await supabase.from('branches').delete().eq('id', parse(uuid, id)));
  }, { revalidate: ['/settings'], log: () => ({ id }) });
}

/** تحديد الصفوف الموجودة في فرع */
export async function setBranchGrades(branchId: string, gradeIds: string[]) {
  return run('branch.grades', ['admin'], async ({ supabase }) => {
    const b = parse(uuid, branchId);
    const ids = parse(z.array(uuid), gradeIds);
    const current = must(await supabase.from('branch_grades').select('grade_id').eq('branch_id', b)) as { grade_id: string }[];
    const have = new Set(current.map((r) => r.grade_id));
    const toAdd = ids.filter((g) => !have.has(g));
    const toRemove = [...have].filter((g) => !ids.includes(g));
    if (toRemove.length) {
      const { count } = await supabase.from('sections').select('id', { count: 'exact', head: true })
        .eq('branch_id', b).in('grade_id', toRemove);
      if (count) throw new ActionError('لا يمكن إزالة صف يحتوي على شعب. احذفي الشعب أولاً.');
      must(await supabase.from('branch_grades').delete().eq('branch_id', b).in('grade_id', toRemove));
    }
    if (toAdd.length) must(await supabase.from('branch_grades').insert(toAdd.map((g) => ({ branch_id: b, grade_id: g }))));
  }, { revalidate: ['/settings'], log: () => ({ branchId, gradeIds }) });
}

// ------------------------------------------------------------------ الصفوف
const gradeSchema = z.object({
  id: uuid.optional(),
  stage_id: uuid,
  name,
  sort_order: z.number().int().min(0).max(999),
  assessment_mode: z.enum(['numeric', 'verbal']),
});

export async function saveGrade(input: z.input<typeof gradeSchema>) {
  return run('grade.save', ['admin'], async ({ supabase }) => {
    const { id, ...v } = parse(gradeSchema, input);
    if (!id) {
      must(await supabase.from('grades').insert(v));
      return v.name;
    }
    const old = must(await supabase.from('grades').select('assessment_mode').eq('id', id).single()) as { assessment_mode: AssessmentMode };
    if (old.assessment_mode !== v.assessment_mode) {
      // تغيير نوع الرصد: مسموح فقط إذا لم يُرصد شيء لهذا الصف
      const gs = must(await supabase.from('grade_subjects').select('id').eq('grade_id', id)) as { id: string }[];
      const gsIds = gs.map((g) => g.id);
      if (gsIds.length) {
        const { count } = await supabase.from('submissions').select('id', { count: 'exact', head: true }).in('grade_subject_id', gsIds);
        if (count) throw new ActionError('لا يمكن تغيير نوع الرصد بعد بدء الرصد لهذا الصف.');
      }
      must(await supabase.from('grades').update(v).eq('id', id));
      // إعادة إنشاء أنواع التقييم بما يناسب النوع الجديد
      for (const g of gsIds) {
        must(await supabase.from('assessment_components').delete().eq('grade_subject_id', g));
        must(await supabase.from('assessment_components').insert(defaultComponents(g, v.assessment_mode)));
      }
      if (v.assessment_mode === 'verbal') {
        const { count } = await supabase.from('verbal_levels').select('id', { count: 'exact', head: true }).eq('grade_id', id);
        if (!count) must(await supabase.from('verbal_levels').insert(
          ['ممتاز', 'جيد جداً', 'جيد', 'يحتاج إلى دعم'].map((label, i) => ({ grade_id: id, label, sort_order: i + 1 }))));
      }
    } else {
      must(await supabase.from('grades').update(v).eq('id', id));
    }
    return v.name;
  }, { revalidate: ['/settings'], log: (n) => ({ name: n }) });
}

function defaultComponents(gsId: string, mode: AssessmentMode): { grade_subject_id: string; name: string; max_score: number | null; sort_order: number }[] {
  return mode === 'verbal'
    ? [{ grade_subject_id: gsId, name: 'التقييم', max_score: null, sort_order: 1 }]
    : [
        { grade_subject_id: gsId, name: 'أعمال السنة', max_score: 20, sort_order: 1 },
        { grade_subject_id: gsId, name: 'الاختبارات القصيرة', max_score: 20, sort_order: 2 },
        { grade_subject_id: gsId, name: 'الاختبار النهائي', max_score: 60, sort_order: 3 },
      ];
}

export async function deleteGrade(id: string) {
  return run('grade.delete', ['admin'], async ({ supabase }) => {
    must(await supabase.from('grades').delete().eq('id', parse(uuid, id)));
  }, { revalidate: ['/settings'], log: () => ({ id }) });
}

// ------------------------------------------------------------------ الشعب
export async function addSections(branchId: string, gradeId: string, names: string[]) {
  return run('section.add', ['admin'], async ({ supabase }) => {
    const list = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (!list.length) throw new ActionError('اكتبي اسم شعبة واحدة على الأقل');
    const { data: existing } = await supabase.from('sections').select('sort_order').eq('branch_id', branchId).eq('grade_id', gradeId);
    const start = (existing?.length ?? 0) + 1;
    must(await supabase.from('sections').insert(
      list.map((n, i) => ({ branch_id: parse(uuid, branchId), grade_id: parse(uuid, gradeId), name: n.slice(0, 40), sort_order: start + i }))));
    return list.length;
  }, { revalidate: ['/settings'], log: (n) => ({ branchId, gradeId, count: n }) });
}

export async function renameSection(id: string, newName: string) {
  return run('section.rename', ['admin'], async ({ supabase }) => {
    must(await supabase.from('sections').update({ name: parse(name, newName) }).eq('id', parse(uuid, id)));
  }, { revalidate: ['/settings'], log: () => ({ id, newName }) });
}

export async function deleteSection(id: string) {
  return run('section.delete', ['admin'], async ({ supabase }) => {
    const { count } = await supabase.from('students').select('id', { count: 'exact', head: true }).eq('section_id', id).eq('is_active', true);
    if (count) throw new ActionError(`لا يمكن حذف شعبة بها ${count} طالب. انقلي الطلاب أولاً.`);
    must(await supabase.from('sections').delete().eq('id', parse(uuid, id)));
  }, { revalidate: ['/settings'], log: () => ({ id }) });
}

// ------------------------------------------------------------------ الرصد اللفظي
export async function saveVerbalLevels(gradeId: string, labels: { id?: string; label: string }[]) {
  return run('verbal.save', ['admin'], async ({ supabase }) => {
    const g = parse(uuid, gradeId);
    const clean = labels.map((l) => ({ ...l, label: l.label.trim() })).filter((l) => l.label);
    if (clean.length < 2) throw new ActionError('أضيفي مستويين على الأقل');
    if (new Set(clean.map((l) => l.label)).size !== clean.length) throw new ActionError('يوجد مستوى مكرر');

    const current = must(await supabase.from('verbal_levels').select('id').eq('grade_id', g)) as { id: string }[];
    const keep = new Set(clean.filter((l) => l.id).map((l) => l.id));
    const remove = current.filter((c) => !keep.has(c.id)).map((c) => c.id);
    if (remove.length) {
      const { count } = await supabase.from('results').select('id', { count: 'exact', head: true }).in('verbal_level_id', remove);
      if (count) throw new ActionError('لا يمكن حذف مستوى مستخدم في رصد سابق. يمكنك تعديل اسمه فقط.');
      must(await supabase.from('verbal_levels').delete().in('id', remove));
    }
    // تجنب تعارض الأسماء المؤقت أثناء إعادة الترتيب
    for (const [i, l] of clean.entries()) {
      if (l.id) must(await supabase.from('verbal_levels').update({ label: `__tmp_${i}_${l.id}`, sort_order: i + 1 }).eq('id', l.id));
    }
    for (const [i, l] of clean.entries()) {
      if (l.id) must(await supabase.from('verbal_levels').update({ label: l.label.slice(0, 60) }).eq('id', l.id));
      else must(await supabase.from('verbal_levels').insert({ grade_id: g, label: l.label.slice(0, 60), sort_order: i + 1 }));
    }
  }, { revalidate: ['/settings'], log: () => ({ gradeId, labels: labels.map((l) => l.label) }) });
}

// ------------------------------------------------------------------ المواد
const subjectSchema = z.object({
  id: uuid.optional(),
  name,
  kind: z.enum(['general', 'kg']),
  sort_order: z.number().int().min(0).max(999),
  is_active: z.boolean().default(true),
});

export async function saveSubject(input: z.input<typeof subjectSchema>) {
  return run('subject.save', ['admin'], async ({ supabase }) => {
    const { id, ...v } = parse(subjectSchema, input);
    if (id) must(await supabase.from('subjects').update(v).eq('id', id));
    else must(await supabase.from('subjects').insert(v));
    return v.name;
  }, { revalidate: ['/settings'], log: (n) => ({ name: n }) });
}

export async function deleteSubject(id: string) {
  return run('subject.delete', ['admin'], async ({ supabase }) => {
    const { count } = await supabase.from('grade_subjects').select('id', { count: 'exact', head: true }).eq('subject_id', id);
    if (count) throw new ActionError('المادة مربوطة بصفوف. افصليها من الصفوف أولاً أو أوقفيها.');
    must(await supabase.from('subjects').delete().eq('id', parse(uuid, id)));
  }, { revalidate: ['/settings'], log: () => ({ id }) });
}

/** ربط مجموعة مواد بمجموعة صفوف دفعة واحدة */
export async function linkSubjects(gradeIds: string[], subjectIds: string[]) {
  return run('subject.link', ['admin'], async ({ supabase }) => {
    const g = parse(z.array(uuid).min(1, 'اختاري صفاً واحداً على الأقل'), gradeIds);
    const s = parse(z.array(uuid).min(1, 'اختاري مادة واحدة على الأقل'), subjectIds);
    const subjects = must(await supabase.from('subjects').select('id, sort_order').in('id', s)) as { id: string; sort_order: number }[];
    const order = new Map(subjects.map((x) => [x.id, x.sort_order]));
    const rows = g.flatMap((gid) => s.map((sid) => ({ grade_id: gid, subject_id: sid, sort_order: order.get(sid) ?? 0 })));
    const res = await supabase.from('grade_subjects').upsert(rows, { onConflict: 'grade_id,subject_id', ignoreDuplicates: true }).select('id');
    return must(res)?.length ?? 0;
  }, { revalidate: ['/settings'], log: (n) => ({ gradeIds, subjectIds, created: n }) });
}

export async function unlinkGradeSubject(id: string) {
  return run('subject.unlink', ['admin'], async ({ supabase }) => {
    const { count } = await supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('grade_subject_id', id);
    if (count) throw new ActionError('لا يمكن فصل مادة تم رصدها. يمكنك استثناؤها من فرع بدلاً من ذلك.');
    must(await supabase.from('grade_subjects').delete().eq('id', parse(uuid, id)));
  }, { revalidate: ['/settings'], log: () => ({ id }) });
}

const componentsSchema = z.array(z.object({
  id: uuid.optional(),
  name,
  max_score: z.number().positive('الدرجة العظمى يجب أن تكون أكبر من صفر').max(1000).nullable(),
})).min(1, 'أضيفي نوع تقييم واحد على الأقل').max(8);

/** حفظ أنواع التقييم ودرجاتها العظمى لمادة في صف، مع خيار تطبيقها على نفس المادة في صفوف أخرى */
export async function saveComponents(gradeSubjectId: string, input: z.input<typeof componentsSchema>, applyToGradeSubjectIds: string[] = []) {
  return run('components.save', ['admin'], async ({ supabase }) => {
    const comps = parse(componentsSchema, input);
    if (new Set(comps.map((c) => c.name)).size !== comps.length) throw new ActionError('يوجد اسم تقييم مكرر');
    const targets = [parse(uuid, gradeSubjectId), ...parse(z.array(uuid), applyToGradeSubjectIds)];
    let updated = 0;

    for (const gsId of targets) {
      const gs = must(await supabase.from('grade_subjects').select('id, grade:grades(assessment_mode)').eq('id', gsId).single()) as
        unknown as { id: string; grade: { assessment_mode: AssessmentMode } };
      const numeric = gs.grade.assessment_mode === 'numeric';
      if (numeric && comps.some((c) => !c.max_score)) throw new ActionError('حددي الدرجة العظمى لكل نوع تقييم');

      const existing = must(await supabase.from('assessment_components').select('id, name').eq('grade_subject_id', gsId)) as { id: string; name: string }[];
      const isSource = gsId === targets[0];
      // للصف الأصلي نطابق بالمعرّف، وللصفوف الأخرى نطابق بالاسم
      const matchId = (c: (typeof comps)[number]) =>
        isSource ? c.id : existing.find((e) => e.name === c.name)?.id;
      const keepIds = new Set(comps.map(matchId).filter(Boolean) as string[]);
      const remove = existing.filter((e) => !keepIds.has(e.id)).map((e) => e.id);
      if (remove.length) {
        const { count } = await supabase.from('submissions').select('id', { count: 'exact', head: true }).in('component_id', remove);
        if (count) throw new ActionError('لا يمكن حذف نوع تقييم تم رصده. يمكنك تعديل اسمه أو درجته فقط.');
        must(await supabase.from('assessment_components').delete().in('id', remove));
      }
      for (const [i, c] of comps.entries()) {
        const id = matchId(c);
        const row = { name: c.name, max_score: numeric ? c.max_score : null, sort_order: i + 1 };
        if (id) must(await supabase.from('assessment_components').update({ ...row, name: `__tmp_${i}` }).eq('id', id));
      }
      for (const [i, c] of comps.entries()) {
        const id = matchId(c);
        const row = { name: c.name, max_score: numeric ? c.max_score : null, sort_order: i + 1 };
        if (id) must(await supabase.from('assessment_components').update(row).eq('id', id));
        else must(await supabase.from('assessment_components').insert({ ...row, grade_subject_id: gsId }));
      }
      updated++;
    }
    return updated;
  }, { revalidate: ['/settings'], log: (n) => ({ gradeSubjectId, targets: n, comps: input.map((c) => `${c.name}:${c.max_score ?? '-'}`) }) });
}

/** استثناء/إعادة مادة لفرع */
export async function toggleBranchSubject(branchId: string, gradeSubjectId: string, enabled: boolean) {
  return run('subject.branch_toggle', ['admin'], async ({ supabase }) => {
    const b = parse(uuid, branchId); const g = parse(uuid, gradeSubjectId);
    if (enabled) must(await supabase.from('branch_subject_exclusions').delete().eq('branch_id', b).eq('grade_subject_id', g));
    else must(await supabase.from('branch_subject_exclusions').upsert({ branch_id: b, grade_subject_id: g }, { ignoreDuplicates: true }));
  }, { revalidate: ['/settings'], log: () => ({ branchId, gradeSubjectId, enabled }) });
}
