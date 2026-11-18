'use client';
import { useMemo, useState } from 'react';
import { Copy, Save, Undo2, Grid3x3 } from 'lucide-react';
import { setBranchSubjectsBulk } from '@/app/actions/admin';
import { useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/empty';
import { ChipPicker } from './subjects-client';
import { cn } from '@/lib/utils';
import type { Branch, Grade, GradeSubject, Subject } from '@/lib/types';

interface P {
  grades: Grade[]; subjects: Subject[]; gradeSubjects: GradeSubject[]; branches: Branch[];
  exclusions: { branch_id: string; grade_subject_id: string }[]; branchGrades: { branch_id: string; grade_id: string }[];
}

/** مصفوفة: المواد (صفوف) × الفروع (أعمدة) — تعديل كل شيء ثم حفظ دفعة واحدة */
export function MatrixTab({ grades, subjects, gradeSubjects, branches, exclusions, branchGrades }: P) {
  const { exec, busy } = useAction();
  const [gradeFilter, setGradeFilter] = useState('');
  const [staged, setStaged] = useState<Map<string, boolean>>(new Map());
  const [src, setSrc] = useState(branches[0]?.id ?? '');
  const [dst, setDst] = useState<string[]>([]);
  const subjName = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects]);
  const off = useMemo(() => new Set(exclusions.map((e) => `${e.branch_id}|${e.grade_subject_id}`)), [exclusions]);
  const open = useMemo(() => new Set(branchGrades.map((r) => `${r.branch_id}|${r.grade_id}`)), [branchGrades]);

  const saved = (b: string, gs: string) => !off.has(`${b}|${gs}`);
  const cur = (b: string, gs: string) => staged.get(`${b}|${gs}`) ?? saved(b, gs);
  const set = (cells: [string, string][], v: boolean) => setStaged((m) => {
    const n = new Map(m);
    cells.forEach(([b, gs]) => { if (saved(b, gs) === v) n.delete(`${b}|${gs}`); else n.set(`${b}|${gs}`, v); });
    return n;
  });

  const shown = grades.filter((g) => (!gradeFilter || g.id === gradeFilter) && gradeSubjects.some((x) => x.grade_id === g.id));
  const blocks = shown.map((g) => ({
    g, list: gradeSubjects.filter((x) => x.grade_id === g.id),
    cols: branches.filter((b) => open.has(`${b.id}|${g.id}`)),
  }));

  const copyFrom = () => {
    if (!src || !dst.length) return;
    const cells: [string, boolean][] = [];
    blocks.forEach(({ g, list }) => {
      if (!open.has(`${src}|${g.id}`)) return;
      dst.filter((d) => d !== src && open.has(`${d}|${g.id}`)).forEach((d) => list.forEach((x) => cells.push([`${d}|${x.id}`, cur(src, x.id)])));
    });
    setStaged((m) => {
      const n = new Map(m);
      cells.forEach(([k, v]) => { const [b, gs] = k.split('|'); if (saved(b, gs) === v) n.delete(k); else n.set(k, v); });
      return n;
    });
  };

  const save = async () => {
    const changes = [...staged].map(([k, enabled]) => { const [branch_id, grade_subject_id] = k.split('|'); return { branch_id, grade_subject_id, enabled }; });
    const r = await exec(() => setBranchSubjectsBulk(changes), {
      confirm: { title: 'حفظ تغييرات المواد', message: <>سيتم تعديل <b className="num">{changes.length}</b> خانة ({changes.filter((c) => c.enabled).length} تفعيل، {changes.filter((c) => !c.enabled).length} إيقاف). لا يُحذف أي رصد موجود، والمادة الموقوفة تُخفى من الفرع فقط.</>, confirmText: 'حفظ' },
      success: (d) => `تم حفظ ${d?.applied ?? 0} تغيير`,
    });
    if (r?.ok) setStaged(new Map());
  };

  return (
    <>
      <div className="card mb-4 space-y-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="الصف" className="flex-1 sm:max-w-xs">
            <Select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
              <option value="">كل الصفوف</option>
              {grades.filter((g) => gradeSubjects.some((x) => x.grade_id === g.id)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </Field>
          <p className="text-[12.5px] leading-6 text-ink-muted">ضعي علامة ✓ على المادة في كل فرع تريدينها، أو استعملي «الكل» لعمود كامل ولصف كامل، ثم احفظي مرة واحدة.</p>
        </div>
        {branches.length > 1 && (
          <details className="rounded-xl border border-line p-3">
            <summary className="cursor-pointer text-[13.5px] font-medium"><Copy className="me-1.5 inline h-4 w-4" />نسخ إعداد فرع إلى فروع أخرى</summary>
            <div className="mt-3 space-y-3">
              <Field label="انسخي من"><Select value={src} onChange={(e) => setSrc(e.target.value)}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
              <div><p className="mb-1.5 text-[13px]">إلى</p><ChipPicker items={branches.filter((b) => b.id !== src).map((b) => ({ id: b.id, label: b.name }))} value={dst} onChange={setDst} /></div>
              <Button size="sm" variant="secondary" disabled={!dst.length} onClick={copyFrom}>تطبيق على الصفوف المعروضة</Button>
              <p className="text-[12px] text-ink-muted">يُطبَّق على الصفوف المفتوحة في الفرعين فقط، ويظهر أمامك قبل الحفظ ويمكنك التراجع عنه.</p>
            </div>
          </details>
        )}
      </div>

      {blocks.length === 0 ? (
        <div className="card"><EmptyState icon={<Grid3x3 className="h-6 w-6" />} title="لا مواد مربوطة بعد" hint="اربطي المواد بالصفوف من تبويب «المواد في الصفوف»." /></div>
      ) : (
        <div className="space-y-4">
          {blocks.map(({ g, list, cols }) => (
            <div key={g.id} className="card overflow-x-auto">
              <p className="border-b border-line px-4 py-3 text-[14.5px] font-semibold">{g.name}</p>
              {cols.length === 0 ? <p className="p-4 text-[13px] text-ink-muted">لا فرع فاتح لهذا الصف. افتحيه من صفحة الفروع.</p> : (
                <table className="w-full min-w-[420px] text-[13px]">
                  <thead>
                    <tr className="bg-surface text-ink-muted">
                      <th className="px-3 py-2 text-start font-medium">المادة</th>
                      {cols.map((b) => {
                        const all = list.every((x) => cur(b.id, x.id));
                        return (
                          <th key={b.id} className="px-2 py-2 text-center font-medium">
                            <p>{b.name}</p>
                            <button type="button" className="text-[11.5px] text-peri-deep" onClick={() => set(list.map((x) => [b.id, x.id]), !all)}>{all ? 'إلغاء الكل' : 'الكل'}</button>
                          </th>
                        );
                      })}
                      <th className="px-2 py-2 text-center font-medium">كل الفروع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {list.map((x) => {
                      const all = cols.every((b) => cur(b.id, x.id));
                      return (
                        <tr key={x.id}>
                          <td className="px-3 py-2">{subjName.get(x.subject_id) ?? '—'}</td>
                          {cols.map((b) => {
                            const v = cur(b.id, x.id); const changed = staged.has(`${b.id}|${x.id}`);
                            return (
                              <td key={b.id} className="px-2 py-2 text-center">
                                <input type="checkbox" checked={v} onChange={(e) => set([[b.id, x.id]], e.target.checked)} aria-label={`${subjName.get(x.subject_id)} — ${b.name}`}
                                  className={cn('h-5 w-5 cursor-pointer accent-black', changed && 'outline outline-2 outline-offset-2 outline-amber-400')} />
                              </td>
                            );
                          })}
                          <td className="px-2 py-2 text-center"><button type="button" className="text-[12px] text-peri-deep" onClick={() => set(cols.map((b) => [b.id, x.id]), !all)}>{all ? 'إلغاء' : 'الكل'}</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {staged.size > 0 && (
        <div className="sticky bottom-3 z-10 mt-4 flex items-center justify-between gap-3 rounded-2xl bg-black p-3 text-white shadow-lg">
          <span className="num text-[13.5px]">{staged.size} تغيير لم يُحفظ</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setStaged(new Map())}><Undo2 className="h-4 w-4" />تراجع</Button>
            <Button size="sm" loading={busy} onClick={save}><Save className="h-4 w-4" />حفظ التغييرات</Button>
          </div>
        </div>
      )}
    </>
  );
}
