import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { newBook } from '@/lib/excel';
import { loadSectionReport, writeSectionSheet, writeProgressSheet } from '@/lib/reports';

export const runtime = 'nodejs';
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;
const fail = (status: number, message: string) => NextResponse.json({ message }, { status });

/**
 * تصدير الكشوفات بصيغة إكسل
 * ?type=section&section=..&term=1&detailed=1     كشف شعبة كامل
 * ?type=subject&section=..&subject=..&term=1     كشف مادة واحدة
 * ?type=branch&branch=..&grade=..&term=1         كل شعب فرع (ورقة لكل شعبة)
 * ?type=progress&branch=..&term=1                تقرير متابعة الرصد
 */
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return fail(401, 'سجّلي الدخول');
  const p = req.nextUrl.searchParams;
  const type = p.get('type');
  const { data: set } = await s.supabase.from('settings').select('current_term').eq('id', 1).single();
  const term = (p.get('term') === '2' ? 2 : p.get('term') === '1' ? 1 : set?.current_term ?? 1) as 1 | 2;
  const detailed = p.get('detailed') !== '0';
  const role = s.profile.role;
  const wb = newBook();
  let filename = 'كشف';

  const sectionBranch = async (id: string) => (await s.supabase.from('sections').select('branch_id').eq('id', id).single()).data?.branch_id as string | undefined;

  try {
    if (type === 'section' || type === 'subject') {
      const section = p.get('section') ?? '';
      const subject = p.get('subject') ?? undefined;
      if (!UUID.test(section) || (type === 'subject' && !UUID.test(subject ?? ''))) return fail(400, 'بيانات غير صحيحة');
      if (role === 'teacher') {
        if (type !== 'subject') return fail(403, 'غير مصرّح');
        const { count } = await s.supabase.from('teacher_assignments').select('id', { count: 'exact', head: true })
          .eq('teacher_id', s.profile.id).eq('section_id', section).eq('grade_subject_id', subject!);
        if (!count) return fail(403, 'غير مصرّح');
      } else if (role === 'supervisor' && (await sectionBranch(section)) !== s.profile.branch_id) {
        return fail(403, 'غير مصرّح');
      }
      const r = await loadSectionReport(s.supabase, section, term, type === 'subject' ? subject : undefined);
      if (!r) return fail(404, 'غير موجود');
      writeSectionSheet(wb, r, { detailed: type === 'subject' ? true : detailed });
      filename = type === 'subject' ? `${r.subjects[0]?.name ?? 'مادة'}-${r.grade}-${r.section}` : `كشف-${r.grade}-${r.section}-${r.branch}`;
    } else if (type === 'branch') {
      if (role === 'teacher') return fail(403, 'غير مصرّح');
      const branch = role === 'supervisor' ? s.profile.branch_id! : p.get('branch') ?? '';
      if (!UUID.test(branch)) return fail(400, 'حددي الفرع');
      let q = s.supabase.from('sections').select('id, name, grade:grades(name, sort_order)').eq('branch_id', branch).eq('is_active', true);
      const grade = p.get('grade');
      if (grade && UUID.test(grade)) q = q.eq('grade_id', grade);
      const { data: secs } = await q;
      const list = ((secs ?? []) as unknown as { id: string; name: string; grade: { name: string; sort_order: number } }[])
        .sort((a, b) => a.grade.sort_order - b.grade.sort_order || a.name.localeCompare(b.name, 'ar'));
      if (!list.length) return fail(404, 'لا توجد شعب');
      if (list.length > 120) return fail(400, 'عدد الشعب كبير، اختاري صفاً محدداً');
      const used = new Set<string>();
      for (const sec of list) {
        const r = await loadSectionReport(s.supabase, sec.id, term);
        if (!r || !r.students.length) continue;
        let name = `${r.grade} ${r.section}`.slice(0, 28);
        while (used.has(name)) name = name + '_';
        used.add(name);
        writeSectionSheet(wb, r, { detailed, sheetName: name });
      }
      if (!wb.worksheets.length) return fail(404, 'لا يوجد طلاب');
      const { data: b } = await s.supabase.from('branches').select('name').eq('id', branch).single();
      filename = `كشوفات-${b?.name ?? 'الفرع'}`;
    } else if (type === 'progress') {
      if (role === 'teacher') return fail(403, 'غير مصرّح');
      const branch = role === 'supervisor' ? s.profile.branch_id! : (p.get('branch') && UUID.test(p.get('branch')!) ? p.get('branch')! : null);
      await writeProgressSheet(wb, s.supabase, branch, term);
      filename = 'متابعة-الرصد';
    } else {
      return fail(400, 'نوع غير معروف');
    }

    const buf = await wb.xlsx.writeBuffer();
    await audit({ action: 'export.' + type, actor: s.profile, details: Object.fromEntries(p.entries()) });
    const name = `${filename}-ت${term}.xlsx`.replace(/[\\/:*?"<>|]/g, '-');
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    await audit({ action: 'export.failed', severity: 'error', actor: s.profile, details: { type, message: (e as Error).message?.slice(0, 300) } });
    return fail(500, 'تعذّر إنشاء الملف');
  }
}
