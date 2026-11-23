'use client';
import { useState } from 'react';
import { CheckCircle2, Lock, Save, Sparkles, HeartHandshake, Unlock } from 'lucide-react';
import { loadConduct, saveConduct, requestConductUnlock, loadConductManage, saveConductManage, type ConductSheet, type ConductStudent, type ConductManageStudent } from '@/app/actions/conduct';
import { useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { cn, fmtDateTime, secLabel } from '@/lib/utils';

interface Sec { id: string; name: string; grade: string; order: number; mode: 'numeric' | 'verbal'; branch?: string }
type Val = number | null;
interface Row extends ConductStudent { att: Val; beh: Val; o_att: Val; o_beh: Val; manual: boolean; m_att: Val; m_beh: Val; t_att: Val; t_beh: Val }

const ATT = [{ v: 100, ar: 'انتظام في الحضور', en: 'Regular Attendance' }, { v: 0, ar: 'عدم الانتظام في الحضور', en: 'Irregular Attendance' }];
const BEH = [{ v: 100, ar: 'التزام بالسلوك الإيجابي', en: 'Commitment to Positive Behavior' }, { v: 0, ar: 'الحاجة إلى تحسين السلوك', en: 'Needs Improvement in Behavior' }];

export function ConductClient({ sections, enabled, migrated, manager = false }: { sections: Sec[]; enabled: boolean; migrated: boolean; manager?: boolean }) {
  const toast = useToast();
  const { exec, busy } = useAction();
  const [secId, setSecId] = useState(sections.length === 1 ? sections[0].id : '');
  const [loading, setLoading] = useState(false);
  const [sheet, setSheet] = useState<ConductSheet | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);

  if (!migrated) return <div className="card p-5 text-[13.5px] leading-7">هذه الميزة لم تُفعَّل بعد في النظام. تواصلي مع الإدارة.</div>;
  if (!enabled) return <div className="card"><EmptyState icon={<HeartHandshake className="h-6 w-6" />} title="كشف المواظبة والسلوك غير مفعّل بعد" hint="ستُفعّله الإدارة من الإعدادات عند بدء الرصد." /></div>;
  if (!sections.length) return <div className="card"><EmptyState icon={<HeartHandshake className="h-6 w-6" />} title={manager ? 'لا توجد شعب' : 'لم تُسند لك أي شعبة بعد'} hint={manager ? undefined : 'تواصلي مع مشرفة الفرع.'} /></div>;

  const open = async () => {
    if (!secId) return;
    setLoading(true);
    if (manager) {
      const r = await loadConductManage(secId);
      setLoading(false);
      if (r.ok && r.data) {
        const d = r.data;
        setSheet({ meta: { ...d.meta, grading_open: true, saved: true, edit_until: null, unlocked_until: null, editable: true, version: null }, students: d.students });
        setRows(d.students.map((s: ConductManageStudent) => ({ ...s, att: s.attendance, beh: s.behavior, o_att: s.attendance, o_beh: s.behavior, manual: s.manual, m_att: s.m_att, m_beh: s.m_beh, t_att: s.t_att, t_beh: s.t_beh })));
        setDirty(false);
      } else toast.error(r.message ?? 'تعذّر فتح الشعبة');
      return;
    }
    const r = await loadConduct(secId);
    setLoading(false);
    if (r.ok && r.data) { setSheet(r.data); setRows(r.data.students.map((s) => ({ ...s, att: s.attendance, beh: s.behavior, o_att: s.attendance, o_beh: s.behavior, manual: false, m_att: null, m_beh: null, t_att: null, t_beh: null }))); setDirty(false); }
    else toast.error(r.message ?? 'تعذّر فتح الكشف');
  };

  if (!sheet) {
    return (
      <div className="card max-w-xl space-y-4 p-5">
        <label className="block space-y-1 text-[13.5px] font-medium">الشعبة
          <select value={secId} onChange={(e) => setSecId(e.target.value)} className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] font-normal">
            <option value="">اختاري الشعبة</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.branch ? `${s.branch} — ` : ''}{s.grade} — {secLabel(s.name)}</option>)}
          </select>
        </label>
        <Button size="lg" loading={loading} disabled={!secId} onClick={open}>{manager ? 'فتح الشعبة' : 'فتح الكشف'}</Button>
      </div>
    );
  }

  const m = sheet.meta;
  const verbal = m.mode === 'verbal';
  const editable = m.editable;
  const eligible = (r: Row) => r.graded >= m.min_subjects;
  const set = (id: string, k: 'att' | 'beh', v: Val) => { setRows((p) => p.map((r) => (r.id === id ? { ...r, [k]: v } : r))); setDirty(true); };
  const clamp = (t: string): Val => { if (t.trim() === '') return null; const n = Number(t); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n * 100) / 100)) : null; };

  const fillFull = () => {
    const todo = rows.filter((r) => eligible(r) && (r.att == null || r.beh == null));
    if (!todo.length) { toast.error('لا يوجد طلاب بلا رصد ضمن الشروط'); return; }
    setRows((p) => p.map((r) => (eligible(r) ? { ...r, att: r.att ?? 100, beh: r.beh ?? 100 } : r)));
    setDirty(true);
    toast.success(`رُصدت الدرجة الكاملة لـ ${todo.length} طالب. راجعي ثم اضغطي حفظ`);
  };

  const done = rows.filter((r) => r.att != null && r.beh != null).length;
  const skipped = rows.filter((r) => !eligible(r)).length;
  const lockLine = manager ? null : !m.saved ? null : editable
    ? `يمكنك التعديل حتى ${fmtDateTime(m.unlocked_until && new Date(m.unlocked_until) > new Date(m.edit_until ?? 0) ? m.unlocked_until : m.edit_until)}`
    : 'الكشف مقفل للتعديل';

  // الأدمن/المشرفة: يُرسل فقط ما تغيّر. البند الذي لم يُلمس يبقى كما هو (قيمته اليدوية إن وُجدت أو بلا قيمة)، والبند الذي مُسح يعود لرصد المعلمة
  const changed = rows.filter((r) => r.att !== r.o_att || r.beh !== r.o_beh);
  const saveManage = () => exec(() => saveConductManage(m.section_id, changed.map((r) => ({
    student_id: r.id,
    attendance: r.att !== r.o_att ? r.att : r.m_att,
    behavior: r.beh !== r.o_beh ? r.beh : r.m_beh,
  }))), {
    confirm: { title: 'حفظ التعديلات', message: <>سيُعدَّل رصد <b>{changed.length}</b> طالب في <b>{m.grade_name}</b> — <b>{secLabel(m.section_name)}</b>، ويظهر في إشعاراتهم مباشرة دون المساس برصد المعلمات.</>, confirmText: 'حفظ' },
    success: 'تم حفظ التعديلات', refresh: false,
  }).then((r) => { if (r?.ok) { setDirty(false); open(); } });

  const save = () => exec(() => saveConduct(m.section_id, rows.map((r) => ({ student_id: r.id, attendance: r.att, behavior: r.beh }))), {
    confirm: { title: 'حفظ المواظبة والسلوك', message: <>سيُحفظ كشف <b>{m.grade_name}</b> — <b>{secLabel(m.section_name)}</b> ({done} من {rows.length} طالب مكتمل الرصد).</>, confirmText: 'حفظ' },
    success: 'تم حفظ المواظبة والسلوك', refresh: false,
  }).then((r) => { if (r?.ok) { setSheet(null); setRows([]); setDirty(false); setSecId(''); } });

  const askUnlock = () => exec(() => requestConductUnlock(m.section_id, ''), {
    confirm: { title: 'طلب فتح الكشف', message: 'سيصل طلبك إلى المشرفة لفتح الكشف للتعديل.', confirmText: 'إرسال الطلب' },
    success: 'تم إرسال الطلب', refresh: false,
  });

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{m.grade_name} — {secLabel(m.section_name)}</p>
          <p className="text-[12.5px] text-ink-muted">الفصل {m.term === 1 ? 'الأول' : 'الثاني'} · {m.year} · {verbal ? 'تقييم لفظي' : 'درجة من 100 لكل منهما'}{lockLine ? ` · ${lockLine}` : ''}</p>
        </div>
        <Button variant="ghost" onClick={() => { if (!dirty || window.confirm('توجد تعديلات غير محفوظة، هل تريدين الخروج؟')) setSheet(null); }}>تغيير الشعبة</Button>
      </div>

      {!manager && !m.grading_open && <div className="card bg-amber-soft p-3 text-[13px]">الرصد مغلق حالياً من الإدارة، والكشف للاطلاع فقط.</div>}
      {!manager && m.grading_open && !editable && (
        <div className="card flex flex-wrap items-center gap-3 bg-surface p-3 text-[13px]">
          <Lock className="h-4 w-4" /><span className="flex-1">انتهت مدة التعديل. أرسلي طلب فتح ليُفتح الكشف لك.</span>
          <Button size="sm" variant="secondary" onClick={askUnlock} disabled={busy}><Unlock className="h-4 w-4" />طلب فتح</Button>
        </div>
      )}

      {manager && (
        <div className="card bg-surface p-3 text-[12.5px] leading-6 text-ink-soft">
          تعديلك هنا <b>يغلب رصد المعلمات</b> في إشعار الطالب ولا يمسّ كشوفهن، ولا يتأثر بقفل التعديل. اترك الخانة فارغة لإعادة الاعتماد على رصد المعلمة.
        </div>
      )}
      {!manager && editable && (
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <Button variant="secondary" onClick={fillFull}><Sparkles className="h-4 w-4" />رصد الجميع بالدرجة الكاملة</Button>
          <p className="flex-1 text-[12.5px] leading-6 text-ink-muted">يشمل فقط الطلاب الذين رُصدت لهم درجات في <b className="num">{m.min_subjects}</b> مواد فأكثر{skipped ? <> ({skipped} طالب غير مشمول حاليًا)</> : null}، ولا يغيّر ما رصدتِه بنفسك.</p>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13.5px]">
            <thead><tr className="bg-surface text-ink-muted">
              <th className="px-4 py-2.5 text-start font-medium">الطالب</th>
              <th className="px-3 py-2.5 text-center font-medium">{verbal ? 'المواظبة' : 'المواظبة (من 100)'}</th>
              <th className="px-3 py-2.5 text-center font-medium">{verbal ? 'السلوك' : 'السلوك (من 100)'}</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className={cn(!eligible(r) && 'bg-surface/50')}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{r.name}</p>
                    <p className="num text-[11.5px] text-ink-muted">{r.number ?? ''}{r.number ? ' · ' : ''}{r.graded} مادة مرصودة{manager && r.manual ? ' · ' : ''}{manager && r.manual && <span className="font-medium text-amber">تعديل يدوي</span>}</p>
                  </td>
                  {(['att', 'beh'] as const).map((k) => (
                    <td key={k} className="px-3 py-2 text-center">
                      {verbal ? (
                        <div className="inline-flex flex-wrap justify-center gap-1">
                          {(k === 'att' ? ATT : BEH).map((o) => (
                            <button key={o.v} type="button" disabled={!editable} onClick={() => set(r.id, k, r[k] === o.v ? null : o.v)}
                              className={cn('rounded-full border px-3 py-1 text-[12px] transition', r[k] === o.v ? (o.v === 100 ? 'border-mint bg-mint-soft text-mint' : 'border-rose bg-rose-soft text-rose') : 'border-line bg-white text-ink-soft hover:border-ink-faint', !editable && 'opacity-60')}>{o.ar}</button>
                          ))}
                        </div>
                      ) : (
                        <div className="inline-flex flex-col items-center">
                          <input type="number" inputMode="decimal" min={0} max={100} step="any" disabled={!editable} value={r[k] ?? ''}
                            onChange={(e) => set(r.id, k, clamp(e.target.value))} className="num h-10 w-24 rounded-xl border border-line bg-white px-2 text-center disabled:opacity-60" />
                          {manager && (k === 'att' ? r.t_att : r.t_beh) != null && <span className="num mt-0.5 text-[11px] text-ink-muted">المعلمات: {k === 'att' ? r.t_att : r.t_beh}</span>}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={3} className="px-4 py-8 text-center text-ink-muted">لا طلاب في هذه الشعبة</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {manager && (
        <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-2xl bg-white p-3 shadow-soft">
          <p className="flex-1 text-[13px] text-ink-soft">{changed.length ? <><span className="num">{changed.length}</span> طالب بتعديلات غير محفوظة</> : 'لا توجد تعديلات'}</p>
          <Button size="lg" loading={busy} disabled={!changed.length} onClick={saveManage}><Save className="h-4 w-4" />حفظ التعديلات</Button>
        </div>
      )}
      {!manager && editable && (
        <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-2xl bg-white p-3 shadow-soft">
          <p className="flex-1 text-[13px] text-ink-soft"><CheckCircle2 className="me-1 inline h-4 w-4 text-mint" /><span className="num">{done}</span> من <span className="num">{rows.length}</span> مكتمل{dirty ? ' · تعديلات غير محفوظة' : ''}</p>
          <Button size="lg" loading={busy} disabled={!dirty && m.saved} onClick={save}><Save className="h-4 w-4" />حفظ</Button>
        </div>
      )}
    </div>
  );
}
