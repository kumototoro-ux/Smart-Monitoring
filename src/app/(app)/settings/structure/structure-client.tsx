'use client';
import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, MessageSquareText, Hash, X, ArrowUp, ArrowDown } from 'lucide-react';
import { saveGrade, deleteGrade, saveVerbalLevels, addSections, renameSection, deleteSection, createGeneralSections } from '@/app/actions/admin';
import { useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { cn, secLabel, GENERAL_SECTION } from '@/lib/utils';
import type { Branch, Grade, Section, Stage, VerbalLevel, AssessmentMode } from '@/lib/types';

interface Props {
  stages: Stage[]; grades: Grade[]; branches: Branch[];
  branchGrades: { branch_id: string; grade_id: string }[];
  sections: Section[]; levels: VerbalLevel[]; studentCount: Record<string, number>;
}

export function StructureClient(p: Props) {
  const [tab, setTab] = useState<'grades' | 'sections'>('grades');
  return (
    <>
      <div className="mb-4 inline-flex rounded-full bg-white p-1 shadow-soft">
        {([['grades', 'الصفوف ونوع الرصد'], ['sections', 'شعب الفروع']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('rounded-full px-4 py-2 text-[13.5px] transition', tab === k ? 'bg-black text-white' : 'text-ink-soft')}>{l}</button>
        ))}
      </div>
      {tab === 'grades' ? <GradesTab {...p} /> : <SectionsTab {...p} />}
    </>
  );
}

// ============================================================ الصفوف
function GradesTab({ stages, grades, levels }: Props) {
  const [edit, setEdit] = useState<Partial<Grade> | null>(null);
  const [verbalFor, setVerbalFor] = useState<Grade | null>(null);
  const [draft, setDraft] = useState<{ id?: string; label: string }[]>([]);
  const { exec, busy } = useAction();

  const openVerbal = (g: Grade) => {
    setVerbalFor(g);
    setDraft(levels.filter((l) => l.grade_id === g.id).map((l) => ({ id: l.id, label: l.label })));
  };
  const move = (i: number, d: -1 | 1) => setDraft((l) => {
    const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l;
    [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEdit({ assessment_mode: 'numeric', stage_id: stages[0]?.id, sort_order: grades.length + 1 })}>
          <Plus className="h-4 w-4" />صف جديد
        </Button>
      </div>
      <div className="space-y-4">
        {stages.map((st) => {
          const list = grades.filter((g) => g.stage_id === st.id);
          return (
            <section key={st.id} className="card overflow-hidden">
              <h2 className="border-b border-line px-5 py-3.5 text-[15px] font-semibold">{st.name}</h2>
              {list.length === 0 ? <p className="px-5 py-4 text-[13px] text-ink-muted">لا توجد صفوف</p> : (
                <ul className="divide-y divide-line">
                  {list.map((g) => {
                    const lv = levels.filter((l) => l.grade_id === g.id);
                    return (
                      <li key={g.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                        <span className="min-w-40 flex-1 text-[14.5px] font-medium">{g.name}</span>
                        {g.assessment_mode === 'verbal'
                          ? <Badge tone="info" icon={<MessageSquareText className="h-3.5 w-3.5" />}>لفظي · {lv.length} مستويات</Badge>
                          : <Badge tone="neutral" icon={<Hash className="h-3.5 w-3.5" />}>درجات</Badge>}
                        <div className="flex gap-1.5">
                          {g.assessment_mode === 'verbal' && (
                            <Button size="sm" variant="soft" onClick={() => openVerbal(g)}>مستويات الرصد</Button>
                          )}
                          <Button size="sm" variant="secondary" onClick={() => setEdit(g)} aria-label="تعديل"><Pencil className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" className="text-rose" aria-label="حذف"
                            onClick={() => exec(() => deleteGrade(g.id), {
                              success: 'تم حذف الصف',
                              confirm: { title: `حذف ${g.name}`, message: 'لا يمكن الحذف إذا كان للصف طلاب أو شعب.', tone: 'danger', confirmText: 'حذف' },
                            })}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'تعديل الصف' : 'صف جديد'}
        footer={<>
          <Button loading={busy} onClick={async () => {
            const r = await exec(() => saveGrade({
              id: edit?.id, stage_id: edit?.stage_id ?? '', name: edit?.name ?? '',
              sort_order: Number(edit?.sort_order ?? 0), assessment_mode: (edit?.assessment_mode ?? 'numeric') as AssessmentMode,
            }), {
              success: 'تم حفظ الصف',
              confirm: edit?.id && grades.find((g) => g.id === edit.id)?.assessment_mode !== edit.assessment_mode
                ? { title: 'تغيير نوع الرصد', message: 'سيتم إعادة إنشاء أنواع التقييم لكل مواد هذا الصف حسب النوع الجديد.', confirmText: 'متابعة' }
                : undefined,
            });
            if (r?.ok) setEdit(null);
          }}>حفظ</Button>
          <Button variant="secondary" onClick={() => setEdit(null)}>إلغاء</Button>
        </>}>
        <div className="space-y-4">
          <Field label="اسم الصف"><Input value={edit?.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="المرحلة">
              <Select value={edit?.stage_id ?? ''} onChange={(e) => setEdit({ ...edit, stage_id: e.target.value })}>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="الترتيب"><Input type="number" value={edit?.sort_order ?? 0} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })} /></Field>
          </div>
          <Field label="نوع الرصد">
            <div className="grid grid-cols-2 gap-2">
              {([['numeric', 'رصد درجات', 'أعمال سنة + قصيرة + نهائي'], ['verbal', 'رصد لفظي', 'ممتاز، جيد جداً ...']] as const).map(([k, l, h]) => (
                <button key={k} type="button" onClick={() => setEdit({ ...edit, assessment_mode: k })}
                  className={cn('rounded-2xl border p-3.5 text-right transition', edit?.assessment_mode === k ? 'border-black ring-2 ring-black/5' : 'border-line')}>
                  <p className="text-[14px] font-medium">{l}</p>
                  <p className="mt-0.5 text-[12px] text-ink-muted">{h}</p>
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Dialog>

      <Dialog open={!!verbalFor} onClose={() => setVerbalFor(null)} title={`مستويات الرصد اللفظي · ${verbalFor?.name ?? ''}`}
        description="اكتبي أسماء المستويات بالترتيب من الأعلى للأدنى"
        footer={<>
          <Button loading={busy} onClick={async () => {
            const r = await exec(() => saveVerbalLevels(verbalFor!.id, draft), { success: 'تم حفظ المستويات' });
            if (r?.ok) setVerbalFor(null);
          }}>حفظ</Button>
          <Button variant="secondary" onClick={() => setVerbalFor(null)}>إلغاء</Button>
        </>}>
        <div className="space-y-2">
          {draft.map((l, i) => (
            <div key={l.id ?? `n${i}`} className="flex items-center gap-2">
              <span className="num w-6 text-center text-[13px] text-ink-muted">{i + 1}</span>
              <Input value={l.label} onChange={(e) => setDraft((d) => d.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
              <button onClick={() => move(i, -1)} className="rounded-lg p-2 text-ink-muted hover:bg-surface" aria-label="أعلى"><ArrowUp className="h-4 w-4" /></button>
              <button onClick={() => move(i, 1)} className="rounded-lg p-2 text-ink-muted hover:bg-surface" aria-label="أسفل"><ArrowDown className="h-4 w-4" /></button>
              <button onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} className="rounded-lg p-2 text-rose hover:bg-rose-soft" aria-label="حذف"><X className="h-4 w-4" /></button>
            </div>
          ))}
          <Button size="sm" variant="soft" onClick={() => setDraft((d) => [...d, { label: '' }])}><Plus className="h-4 w-4" />إضافة مستوى</Button>
        </div>
      </Dialog>
    </>
  );
}

// ============================================================ الشعب
function SectionsTab({ grades, branches, branchGrades, sections, studentCount }: Props) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [adding, setAdding] = useState<Grade | null>(null);
  const [names, setNames] = useState('');
  const [rename, setRename] = useState<Section | null>(null);
  const { exec, busy } = useAction();

  const branchGradeList = useMemo(() => {
    const ids = new Set(branchGrades.filter((r) => r.branch_id === branchId).map((r) => r.grade_id));
    return grades.filter((g) => ids.has(g.id));
  }, [branchGrades, branchId, grades]);

  const noSections = branchGradeList.filter((g) => !sections.some((s) => s.branch_id === branchId && s.grade_id === g.id)).length;

  if (!branches.length) return <div className="card"><EmptyState title="أضيفي فرعاً أولاً" hint="من صفحة الفروع" /></div>;

  return (
    <>
      <div className="card mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Field label="الفرع" className="flex-1">
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="sm:max-w-xs">
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        {noSections > 0 && (
          <Button variant="soft" loading={busy} onClick={() => exec(() => createGeneralSections(branchId), {
            confirm: { title: 'صفوف بدون شعب', confirmText: 'إنشاء',
              message: <>سيُنشأ لكل صف من الصفوف الـ <b className="num">{noSections}</b> التي ليس لها شعب شعبة واحدة باسم «عام»، ويُضم إليها طلاب الصف تلقائياً.</> },
            success: (d) => `تم إنشاء ${d?.sections ?? 0} شعبة «عام»${d?.moved ? ` وضم ${d.moved} طالب` : ''}`,
          })}>
            <Plus className="h-4 w-4" />«عام» لـ {noSections} صف بلا شعب
          </Button>
        )}
      </div>
      <p className="mb-4 flex items-start gap-2 rounded-card bg-peri-soft px-4 py-3 text-[13px] leading-6 text-peri-deep">
        الصف الواحد الذي يضم كل الطلاب والطالبات تكفيه شعبة «عام»، وتُنشأ تلقائياً عند إضافة الصف للفرع، ويُضم إليها كل طلابه بدون أي خطوة من المعلمات.
        وإذا كان الصف مقسّماً أضيفي شعبه (أ، ب …) فتُستبدل «عام» تلقائياً.
      </p>
      {branchGradeList.length === 0 ? (
        <div className="card"><EmptyState title="لا توجد صفوف لهذا الفرع" hint="حددي صفوف الفرع من صفحة الفروع ← الصفوف" /></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {branchGradeList.map((g) => {
            const list = sections.filter((s) => s.branch_id === branchId && s.grade_id === g.id);
            return (
              <div key={g.id} className="card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[14.5px] font-semibold">{g.name}</p>
                  <Button size="sm" variant="soft" onClick={() => { setAdding(g); setNames(''); }}><Plus className="h-4 w-4" />شعب</Button>
                </div>
                {list.length === 0 ? <p className="text-[13px] text-rose">لا توجد شعب — المعلمات لن يستطعن الرصد لهذا الصف</p> : (
                  <div className="flex flex-wrap gap-2">
                    {list.map((s) => (
                      <span key={s.id} className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-3 text-[13px]">
                        {secLabel(s.name)}
                        <span className="num text-[11.5px] text-ink-muted">({studentCount[s.id] ?? 0})</span>
                        <button onClick={() => setRename(s)} className="rounded-full p-1 text-ink-muted hover:bg-white" aria-label="تعديل"><Pencil className="h-3.5 w-3.5" /></button>
                        <button aria-label="حذف" className="rounded-full p-1 text-ink-muted hover:bg-white hover:text-rose"
                          onClick={() => exec(() => deleteSection(s.id), {
                            success: 'تم حذف الشعبة',
                            confirm: { title: `حذف ${secLabel(s.name)}`, message: `${g.name} — سيتم حذف إسنادات المعلمات لهذه الشعبة.`, tone: 'danger', confirmText: 'حذف' },
                          })}><X className="h-3.5 w-3.5" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!adding} onClose={() => setAdding(null)} title={`إضافة شعب · ${adding?.name ?? ''}`}
        description="اكتبي أسماء الشعب مفصولة بفاصلة، مثل: أ، ب، ج"
        footer={<>
          <Button loading={busy} onClick={async () => {
            const hasGeneral = sections.some((x) => x.branch_id === branchId && x.grade_id === adding!.id && x.name === GENERAL_SECTION);
            const r = await exec(() => addSections(branchId, adding!.id, names.split(/[,،\n]/)), {
              confirm: hasGeneral && names.trim() !== GENERAL_SECTION ? {
                title: 'تقسيم الصف إلى شعب', confirmText: 'تقسيم',
                message: 'هذا الصف حالياً «عام». ستُحذف «عام» ويعود طلابها لقائمة طلاب الصف، لتختار كل معلمة طلاب شعبتها أو توزّعيهم من صفحة الطلاب.',
              } : undefined,
              success: (d) => `تمت إضافة ${d?.added ?? 0} شعبة${d?.released ? ` — ${d.released} طالب عادوا لقائمة الصف` : ''}${d?.moved ? ` — ضُم ${d.moved} طالب` : ''}`,
            });
            if (r?.ok) setAdding(null);
          }}>إضافة</Button>
          <Button variant="secondary" onClick={() => setAdding(null)}>إلغاء</Button>
        </>}>
        <Input value={names} onChange={(e) => setNames(e.target.value)} placeholder="أ، ب، ج" />
        <div className="mt-3 flex flex-wrap gap-2">
          {[GENERAL_SECTION, 'أ، ب', 'أ، ب، ج', 'أ، ب، ج، د'].map((x) => (
            <button key={x} onClick={() => setNames(x)} className="rounded-full bg-surface px-3 py-1.5 text-[12.5px] text-ink-soft hover:bg-peri-soft">{x}</button>
          ))}
        </div>
      </Dialog>

      <Dialog open={!!rename} onClose={() => setRename(null)} title="تعديل اسم الشعبة"
        footer={<>
          <Button loading={busy} onClick={async () => {
            const r = await exec(() => renameSection(rename!.id, rename!.name), { success: 'تم التعديل' });
            if (r?.ok) setRename(null);
          }}>حفظ</Button>
          <Button variant="secondary" onClick={() => setRename(null)}>إلغاء</Button>
        </>}>
        <Input value={rename?.name ?? ''} onChange={(e) => setRename(rename && { ...rename, name: e.target.value })} />
      </Dialog>
    </>
  );
}
