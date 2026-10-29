'use client';
import { useState } from 'react';
import { Building2, Plus, Pencil, Trash2, Layers, Users } from 'lucide-react';
import { saveBranch, deleteBranch, setBranchGrades } from '@/app/actions/admin';
import { useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Switch } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import type { Branch, Grade, Stage } from '@/lib/types';

export function BranchesClient({ branches, stages, grades, gradesByBranch, teacherCount }: {
  branches: Branch[]; stages: Stage[]; grades: Grade[];
  gradesByBranch: Record<string, string[]>; teacherCount: Record<string, number>;
}) {
  const [edit, setEdit] = useState<Partial<Branch> | null>(null);
  const [gradesFor, setGradesFor] = useState<Branch | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const { exec, busy } = useAction();

  const openGrades = (b: Branch) => { setGradesFor(b); setPicked(gradesByBranch[b.id] ?? []); };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEdit({ is_active: true })}><Plus className="h-4 w-4" />فرع جديد</Button>
      </div>

      {branches.length === 0 ? (
        <div className="card"><EmptyState icon={<Building2 className="h-6 w-6" />} title="لا توجد فروع بعد" hint="ابدئي بإضافة أول فرع ثم حددي صفوفه." /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {branches.map((b) => (
            <div key={b.id} className={cn('card p-5', !b.is_active && 'opacity-60')}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-peri-soft text-peri-deep"><Building2 className="h-5 w-5" /></span>
                  <div>
                    <p className="text-[15.5px] font-semibold">{b.name}</p>
                    {b.code && <p className="text-[12.5px] text-ink-muted">رمز: {b.code}</p>}
                  </div>
                </div>
                {!b.is_active && <Badge tone="danger">موقوف</Badge>}
              </div>
              <div className="mt-4 flex gap-4 text-[13px] text-ink-soft">
                <span className="inline-flex items-center gap-1.5"><Layers className="h-4 w-4 text-ink-muted" />{gradesByBranch[b.id]?.length ?? 0} صف</span>
                <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-ink-muted" />{teacherCount[b.id] ?? 0} معلمة</span>
              </div>
              <div className="mt-4 flex gap-2 border-t border-line pt-4">
                <Button size="sm" variant="soft" onClick={() => openGrades(b)}><Layers className="h-4 w-4" />الصفوف</Button>
                <Button size="sm" variant="secondary" onClick={() => setEdit(b)}><Pencil className="h-4 w-4" />تعديل</Button>
                <Button size="sm" variant="ghost" className="mr-auto text-rose" aria-label="حذف"
                  onClick={() => exec(() => deleteBranch(b.id), {
                    success: 'تم حذف الفرع',
                    confirm: { title: `حذف ${b.name}`, message: 'سيتم حذف الفرع وكل شعبه. لا يمكن الحذف إذا كان فيه طلاب أو حسابات.', tone: 'danger', confirmText: 'حذف' },
                  })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'تعديل الفرع' : 'فرع جديد'}
        footer={<>
          <Button loading={busy} onClick={async () => {
            const r = await exec(() => saveBranch({ id: edit?.id, name: edit?.name ?? '', code: edit?.code ?? '', is_active: edit?.is_active ?? true }), { success: 'تم حفظ الفرع' });
            if (r?.ok) setEdit(null);
          }}>حفظ</Button>
          <Button variant="secondary" onClick={() => setEdit(null)}>إلغاء</Button>
        </>}>
        <div className="space-y-4">
          <Field label="اسم الفرع"><Input value={edit?.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="مثال: فرع الصفا" /></Field>
          <Field label="الرمز (اختياري)" hint="يظهر في الكشوفات المختصرة"><Input value={edit?.code ?? ''} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
          <div className="flex items-center justify-between rounded-2xl bg-surface p-3.5">
            <span className="text-[14px]">الفرع مفعّل</span>
            <Switch checked={edit?.is_active ?? true} onChange={(v) => setEdit({ ...edit, is_active: v })} />
          </div>
        </div>
      </Dialog>

      <Dialog open={!!gradesFor} onClose={() => setGradesFor(null)} size="lg" title={`صفوف ${gradesFor?.name ?? ''}`}
        description="حددي الصفوف الموجودة في هذا الفرع"
        footer={<>
          <Button loading={busy} onClick={async () => {
            const r = await exec(() => setBranchGrades(gradesFor!.id, picked), { success: 'تم حفظ صفوف الفرع' });
            if (r?.ok) setGradesFor(null);
          }}>حفظ ({picked.length})</Button>
          <Button variant="secondary" onClick={() => setGradesFor(null)}>إلغاء</Button>
        </>}>
        <div className="space-y-5">
          {stages.map((st) => {
            const list = grades.filter((g) => g.stage_id === st.id);
            if (!list.length) return null;
            const all = list.every((g) => picked.includes(g.id));
            return (
              <div key={st.id}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[14px] font-medium">{st.name}</p>
                  <button className="text-[12.5px] text-peri-deep" onClick={() =>
                    setPicked((p) => all ? p.filter((x) => !list.some((g) => g.id === x)) : [...new Set([...p, ...list.map((g) => g.id)])])}>
                    {all ? 'إلغاء الكل' : 'تحديد الكل'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {list.map((g) => {
                    const on = picked.includes(g.id);
                    return (
                      <button key={g.id} onClick={() => setPicked((p) => on ? p.filter((x) => x !== g.id) : [...p, g.id])}
                        className={cn('rounded-full border px-3.5 py-2 text-[13px] transition', on ? 'border-black bg-black text-white' : 'border-line bg-white text-ink-soft hover:border-ink-faint')}>
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Dialog>
    </>
  );
}
