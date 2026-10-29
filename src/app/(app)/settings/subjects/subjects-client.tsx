'use client';
import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Link2, Unlink, SlidersHorizontal, Building2, X, BookOpen } from 'lucide-react';
import {
  saveSubject, deleteSubject, linkSubjects, unlinkGradeSubject, saveComponents, toggleBranchSubject,
} from '@/app/actions/admin';
import { useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Switch } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { cn, normalizeDigits } from '@/lib/utils';
import type { Branch, Component, Grade, GradeSubject, Stage, Subject } from '@/lib/types';

interface Props {
  stages: Stage[]; grades: Grade[]; subjects: Subject[]; gradeSubjects: GradeSubject[];
  components: Component[]; branches: Branch[];
  exclusions: { branch_id: string; grade_subject_id: string }[]; usedGradeSubjects: string[];
}

export function SubjectsClient(p: Props) {
  const [tab, setTab] = useState<'link' | 'list'>('link');
  return (
    <>
      <div className="mb-4 inline-flex rounded-full bg-white p-1 shadow-soft">
        {([['link', 'المواد في الصفوف'], ['list', 'قائمة المواد']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('rounded-full px-4 py-2 text-[13.5px] transition', tab === k ? 'bg-black text-white' : 'text-ink-soft')}>{l}</button>
        ))}
      </div>
      {tab === 'link' ? <LinkTab {...p} /> : <ListTab {...p} />}
    </>
  );
}

// ============================================================ قائمة المواد
function ListTab({ subjects }: Props) {
  const [edit, setEdit] = useState<Partial<Subject> | null>(null);
  const { exec, busy } = useAction();
  const groups: [string, Subject[]][] = [
    ['المواد العامة', subjects.filter((s) => s.kind === 'general')],
    ['مواد وتقييمات التمهيدي', subjects.filter((s) => s.kind === 'kg')],
  ];
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEdit({ kind: 'general', is_active: true, sort_order: subjects.length + 1 })}><Plus className="h-4 w-4" />مادة جديدة</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map(([title, list]) => (
          <section key={title} className="card overflow-hidden">
            <h2 className="border-b border-line px-5 py-3.5 text-[15px] font-semibold">{title} <span className="text-ink-muted">({list.length})</span></h2>
            <ul className="divide-y divide-line">
              {list.map((s) => (
                <li key={s.id} className={cn('flex items-center gap-3 px-5 py-3', !s.is_active && 'opacity-50')}>
                  <span className="flex-1 text-[14px]">{s.name}</span>
                  {!s.is_active && <Badge tone="danger">موقوفة</Badge>}
                  <button onClick={() => setEdit(s)} className="rounded-lg p-2 text-ink-muted hover:bg-surface" aria-label="تعديل"><Pencil className="h-4 w-4" /></button>
                  <button aria-label="حذف" className="rounded-lg p-2 text-ink-muted hover:bg-rose-soft hover:text-rose"
                    onClick={() => exec(() => deleteSubject(s.id), { success: 'تم حذف المادة', confirm: { title: `حذف ${s.name}`, tone: 'danger', confirmText: 'حذف', message: 'لا يمكن حذف مادة مربوطة بصفوف.' } })}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'تعديل المادة' : 'مادة جديدة'}
        footer={<>
          <Button loading={busy} onClick={async () => {
            const r = await exec(() => saveSubject({ id: edit?.id, name: edit?.name ?? '', kind: edit?.kind ?? 'general', sort_order: Number(edit?.sort_order ?? 0), is_active: edit?.is_active ?? true }), { success: 'تم حفظ المادة' });
            if (r?.ok) setEdit(null);
          }}>حفظ</Button>
          <Button variant="secondary" onClick={() => setEdit(null)}>إلغاء</Button>
        </>}>
        <div className="space-y-4">
          <Field label="اسم المادة"><Input value={edit?.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="التصنيف">
              <Select value={edit?.kind ?? 'general'} onChange={(e) => setEdit({ ...edit, kind: e.target.value as Subject['kind'] })}>
                <option value="general">مادة عامة</option>
                <option value="kg">تمهيدي</option>
              </Select>
            </Field>
            <Field label="الترتيب في الكشف"><Input type="number" value={edit?.sort_order ?? 0} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })} /></Field>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-surface p-3.5">
            <span className="text-[14px]">المادة مفعّلة</span>
            <Switch checked={edit?.is_active ?? true} onChange={(v) => setEdit({ ...edit, is_active: v })} />
          </div>
        </div>
      </Dialog>
    </>
  );
}

// ============================================================ الربط والتقييم
type Draft = { id?: string; name: string; max: string };

function LinkTab({ stages, grades, subjects, gradeSubjects, components, branches, exclusions, usedGradeSubjects }: Props) {
  const [gradeId, setGradeId] = useState(grades.find((g) => g.assessment_mode === 'numeric')?.id ?? grades[0]?.id ?? '');
  const [linkOpen, setLinkOpen] = useState(false);
  const [lg, setLg] = useState<string[]>([]);
  const [ls, setLs] = useState<string[]>([]);
  const [compFor, setCompFor] = useState<GradeSubject | null>(null);
  const [draft, setDraft] = useState<Draft[]>([]);
  const [applyTo, setApplyTo] = useState<string[]>([]);
  const [branchFor, setBranchFor] = useState<GradeSubject | null>(null);
  const { exec, busy } = useAction();

  const grade = grades.find((g) => g.id === gradeId);
  const numeric = grade?.assessment_mode === 'numeric';
  const subjName = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects]);
  const list = gradeSubjects.filter((g) => g.grade_id === gradeId);
  const compsOf = (gsId: string) => components.filter((c) => c.grade_subject_id === gsId);

  const openComps = (gs: GradeSubject) => {
    setCompFor(gs);
    setDraft(compsOf(gs.id).map((c) => ({ id: c.id, name: c.name, max: c.max_score?.toString() ?? '' })));
    setApplyTo([]);
  };
  // نفس المادة في صفوف أخرى بنفس نوع الرصد
  const siblings = compFor ? gradeSubjects.filter((g) => g.subject_id === compFor.subject_id && g.id !== compFor.id
    && grades.find((x) => x.id === g.grade_id)?.assessment_mode === grade?.assessment_mode) : [];
  const total = draft.reduce((a, d) => a + (Number(normalizeDigits(d.max)) || 0), 0);

  return (
    <>
      <div className="card mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Field label="الصف" className="flex-1 sm:max-w-xs">
          <Select value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
            {stages.map((st) => (
              <optgroup key={st.id} label={st.name}>
                {grades.filter((g) => g.stage_id === st.id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>
        {grade && <Badge tone={numeric ? 'neutral' : 'info'} className="self-start sm:self-center">{numeric ? 'رصد درجات' : 'رصد لفظي'}</Badge>}
        <Button className="sm:mr-auto" onClick={() => { setLinkOpen(true); setLg(gradeId ? [gradeId] : []); setLs([]); }}>
          <Link2 className="h-4 w-4" />ربط مواد بصفوف
        </Button>
      </div>

      {list.length === 0 ? (
        <div className="card"><EmptyState icon={<BookOpen className="h-6 w-6" />} title="لا توجد مواد مربوطة بهذا الصف" hint="اربطي المواد لتظهر للمعلمات في الإسناد والرصد." /></div>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {list.map((gs) => {
              const cs = compsOf(gs.id);
              const sum = cs.reduce((a, c) => a + (c.max_score ?? 0), 0);
              const excluded = exclusions.filter((e) => e.grade_subject_id === gs.id).length;
              return (
                <li key={gs.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-medium">{subjName.get(gs.subject_id)}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {cs.map((c) => (
                        <span key={c.id} className="rounded-full bg-surface px-2.5 py-1 text-[12px] text-ink-soft">
                          {c.name}{numeric && <span className="num mr-1 font-medium text-ink">{c.max_score ?? '؟'}</span>}
                        </span>
                      ))}
                      {numeric && <span className={cn('num rounded-full px-2.5 py-1 text-[12px] font-medium', sum === 100 ? 'bg-mint-soft text-mint' : 'bg-amber-soft text-amber')}>المجموع {sum}</span>}
                      {excluded > 0 && <Badge tone="warning">مستثناة من {excluded} فرع</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="soft" onClick={() => openComps(gs)}><SlidersHorizontal className="h-4 w-4" />التقييم</Button>
                    <Button size="sm" variant="secondary" onClick={() => setBranchFor(gs)}><Building2 className="h-4 w-4" />الفروع</Button>
                    <Button size="sm" variant="ghost" className="text-rose" aria-label="فصل"
                      disabled={usedGradeSubjects.includes(gs.id)}
                      title={usedGradeSubjects.includes(gs.id) ? 'تم الرصد لهذه المادة' : undefined}
                      onClick={() => exec(() => unlinkGradeSubject(gs.id), {
                        success: 'تم فصل المادة',
                        confirm: { title: 'فصل المادة عن الصف', message: `${subjName.get(gs.subject_id)} — ${grade?.name}. سيتم حذف إسنادات المعلمات لهذه المادة.`, tone: 'danger', confirmText: 'فصل' },
                      })}><Unlink className="h-4 w-4" /></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ربط جماعي */}
      <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} size="xl" title="ربط مواد بصفوف"
        description="اختاري المواد والصفوف، وسيتم ربط كل مادة بكل صف مع إنشاء أنواع التقييم الافتراضية"
        footer={<>
          <Button loading={busy} disabled={!lg.length || !ls.length} onClick={async () => {
            const r = await exec(() => linkSubjects(lg, ls), { success: (n) => (n ? `تم إنشاء ${n} ربط جديد` : 'كل المواد المختارة مربوطة مسبقاً') });
            if (r?.ok) setLinkOpen(false);
          }}>ربط {ls.length} مادة × {lg.length} صف</Button>
          <Button variant="secondary" onClick={() => setLinkOpen(false)}>إلغاء</Button>
        </>}>
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="label">المواد</p>
            <ChipPicker items={subjects.filter((s) => s.is_active).map((s) => ({ id: s.id, label: s.name }))} value={ls} onChange={setLs} />
          </div>
          <div>
            <p className="label">الصفوف</p>
            {stages.map((st) => (
              <div key={st.id} className="mb-3">
                <p className="mb-1.5 text-[12px] text-ink-muted">{st.name}</p>
                <ChipPicker items={grades.filter((g) => g.stage_id === st.id).map((g) => ({ id: g.id, label: g.name }))} value={lg} onChange={setLg} />
              </div>
            ))}
          </div>
        </div>
      </Dialog>

      {/* أنواع التقييم */}
      <Dialog open={!!compFor} onClose={() => setCompFor(null)} size="lg"
        title={`التقييم · ${compFor ? subjName.get(compFor.subject_id) : ''}`}
        description={numeric ? 'أنواع التقييم والدرجة العظمى لكل نوع' : 'رصد لفظي: يكفي نوع تقييم واحد عادةً'}
        footer={<>
          <Button loading={busy} onClick={async () => {
            const r = await exec(() => saveComponents(compFor!.id,
              draft.map((d) => ({ id: d.id, name: d.name, max_score: numeric ? Number(normalizeDigits(d.max)) || null : null })), applyTo),
              { success: (n) => (n && n > 1 ? `تم الحفظ في ${n} صفوف` : 'تم حفظ التقييم') });
            if (r?.ok) setCompFor(null);
          }}>حفظ</Button>
          <Button variant="secondary" onClick={() => setCompFor(null)}>إلغاء</Button>
        </>}>
        <div className="space-y-2.5">
          {draft.map((d, i) => (
            <div key={d.id ?? `n${i}`} className="flex items-center gap-2">
              <Input value={d.name} placeholder="اسم التقييم (مثال: الاختبارات التحريرية)" onChange={(e) => setDraft((l) => l.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              {numeric && (
                <Input className="num w-24 shrink-0 text-center" inputMode="decimal" placeholder="العظمى" value={d.max}
                  onChange={(e) => setDraft((l) => l.map((x, j) => j === i ? { ...x, max: e.target.value } : x))} />
              )}
              <button onClick={() => setDraft((l) => l.filter((_, j) => j !== i))} className="rounded-lg p-2 text-rose hover:bg-rose-soft" aria-label="حذف"><X className="h-4 w-4" /></button>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <Button size="sm" variant="soft" onClick={() => setDraft((l) => [...l, { name: '', max: '' }])}><Plus className="h-4 w-4" />نوع تقييم</Button>
            {numeric && <span className={cn('num text-[13.5px] font-medium', total === 100 ? 'text-mint' : 'text-amber')}>المجموع: {total}</span>}
          </div>
          {siblings.length > 0 && (
            <div className="mt-4 rounded-2xl bg-surface p-4">
              <p className="mb-2 text-[13px] font-medium">تطبيق نفس التقييم على المادة في صفوف أخرى</p>
              <ChipPicker items={siblings.map((s) => ({ id: s.id, label: grades.find((g) => g.id === s.grade_id)?.name ?? '' }))} value={applyTo} onChange={setApplyTo} />
            </div>
          )}
        </div>
      </Dialog>

      {/* الفروع */}
      <Dialog open={!!branchFor} onClose={() => setBranchFor(null)}
        title={`الفروع · ${branchFor ? subjName.get(branchFor.subject_id) : ''}`}
        description="أوقفي المادة في الفروع التي لا تدرّسها لهذا الصف">
        <ul className="divide-y divide-line pb-3">
          {branches.map((b) => {
            const on = !exclusions.some((e) => e.branch_id === b.id && e.grade_subject_id === branchFor?.id);
            return (
              <li key={b.id} className="flex items-center justify-between py-3">
                <span className="text-[14px]">{b.name}</span>
                <Switch checked={on} disabled={busy} label={b.name}
                  onChange={(v) => exec(() => toggleBranchSubject(b.id, branchFor!.id, v), { success: v ? 'تم تفعيل المادة للفرع' : 'تم إيقاف المادة للفرع' })} />
              </li>
            );
          })}
        </ul>
      </Dialog>
    </>
  );
}

export function ChipPicker({ items, value, onChange }: { items: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const all = items.length > 0 && items.every((i) => value.includes(i.id));
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.length > 1 && (
        <button onClick={() => onChange(all ? value.filter((v) => !items.some((i) => i.id === v)) : [...new Set([...value, ...items.map((i) => i.id)])])}
          className="rounded-full px-3 py-1.5 text-[12.5px] text-peri-deep hover:bg-peri-soft">{all ? 'إلغاء الكل' : 'الكل'}</button>
      )}
      {items.map((i) => {
        const on = value.includes(i.id);
        return (
          <button key={i.id} onClick={() => onChange(on ? value.filter((v) => v !== i.id) : [...value, i.id])}
            className={cn('rounded-full border px-3 py-1.5 text-[12.5px] transition', on ? 'border-black bg-black text-white' : 'border-line bg-white text-ink-soft hover:border-ink-faint')}>
            {i.label}
          </button>
        );
      })}
    </div>
  );
}
