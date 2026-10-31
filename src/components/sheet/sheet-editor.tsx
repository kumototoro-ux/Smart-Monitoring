'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight, AlertTriangle, Lock, Clock, UserPlus, UserMinus, CheckCircle2, Info, Undo2,
  ClipboardCheck, PencilLine, Save, Send, RotateCcw, ChevronDown, History, Download,
} from 'lucide-react';
import type { SheetData } from '@/app/actions/grading';
import { saveSheet, teacherAddStudent, excludeStudent, restoreStudent, createRequest, loadSheet, releaseStudents } from '@/app/actions/grading';
import { PoolPicker } from './pool-picker';
import { useAction } from '@/lib/use-action';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Bar } from '@/components/ui/progress';
import { cn, normalizeDigits, timeLeft, scrollAppTop, secLabel } from '@/lib/utils';

type Cell = { raw: string; absent: boolean; level: string | null };
const RELEASE = 'ليس من شعبتي — إرجاعه لقائمة طلاب الصف';
type Values = Record<string, Cell>;
const k = (s: string, c: string) => `${s}:${c}`;
const ABSENT = /^\s*(غ|غائب|غائبة|غياب|a|abs)\s*$/i;

function cellState(cell: Cell | undefined, max: number | null, verbal: boolean): 'empty' | 'ok' | 'over' | 'invalid' | 'absent' {
  if (!cell) return 'empty';
  if (cell.absent) return 'absent';
  if (verbal) return cell.level ? 'ok' : 'empty';
  const t = normalizeDigits(cell.raw).trim();
  if (t === '') return 'empty';
  if (!/^\d+(\.\d+)?$/.test(t)) return 'invalid';
  const n = Number(t);
  if (max !== null && n > max) return 'over';
  if (Math.round(n * 4) !== n * 4) return 'invalid';
  return 'ok';
}

export function SheetEditor({ initial, scope, role, onBack }: {
  initial: SheetData; scope: string[] | 'all'; role: 'teacher' | 'admin' | 'supervisor'; onBack: () => void;
}) {
  const [data, setData] = useState(initial);
  const verbal = data.meta.mode === 'verbal';
  const comps = useMemo(() => data.components.filter((c) => scope === 'all' || scope.includes(c.id)), [data.components, scope]);
  const draftKey = `mirqat:draft:${data.meta.viewer_id}:${data.meta.section_id}:${data.meta.grade_subject_id}:${data.meta.term}`;
  const canWriteRole = role === 'teacher' || role === 'admin';
  const closed = role === 'teacher' && (!data.meta.grading_open);
  const editable = (c: SheetData['components'][number]) => canWriteRole && !closed && (role === 'admin' || c.editable);
  const editableComps = comps.filter(editable);
  const lockedComps = comps.filter((c) => !c.editable && c.submitted_at);

  const fromServer = useCallback((d: SheetData): Values => {
    const v: Values = {};
    d.students.forEach((s) => d.components.forEach((c) => {
      const r = d.results[k(s.id, c.id)];
      if (r) v[k(s.id, c.id)] = { raw: r.score === null ? '' : String(r.score), absent: r.is_absent, level: r.verbal_level_id };
    }));
    return v;
  }, []);

  const [values, setValues] = useState<Values>(() => fromServer(initial));
  const [phase, setPhase] = useState<'entry' | 'review' | 'done'>('entry');
  const [showErrors, setShowErrors] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [poolOpen, setPoolOpen] = useState(false);
  const [newStudent, setNewStudent] = useState({ full_name: '', gender: '', national_id: '', student_number: '' });
  const [excludeFor, setExcludeFor] = useState<SheetData['students'][number] | null>(null);
  const [excludeReason, setExcludeReason] = useState(RELEASE);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockNote, setUnlockNote] = useState('');
  const [showExcluded, setShowExcluded] = useState(false);
  const [saved, setSaved] = useState<{ saved: number; students: number } | null>(null);
  const { exec, busy } = useAction();
  const confirm = useConfirm();
  const toast = useToast();
  const tableRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------- المسودة
  useEffect(() => {
    if (!editableComps.length) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as { at: number; values: Values };
      if (Date.now() - d.at > 7 * 86400_000) { localStorage.removeItem(draftKey); return; }
      const server = fromServer(initial);
      const differs = Object.entries(d.values).some(([key, v]) => {
        const s = server[key];
        return !s || s.raw !== v.raw || s.absent !== v.absent || s.level !== v.level;
      });
      if (differs) { setValues((cur) => ({ ...cur, ...d.values })); setDraftRestored(true); }
    } catch { /* التخزين غير متاح */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'entry' || !editableComps.length) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify({ at: Date.now(), values })); } catch { /* */ }
    }, 600);
    return () => clearTimeout(t);
  }, [values, phase, draftKey, editableComps.length]);

  const discardDraft = async () => {
    if (!(await confirm({ title: 'تجاهل المسودة', message: 'سيتم إرجاع الكشف لآخر نسخة محفوظة.', confirmText: 'تجاهل', tone: 'danger' }))) return;
    try { localStorage.removeItem(draftKey); } catch { /* */ }
    setValues(fromServer(data)); setDraftRestored(false);
  };

  // ------------------------------------------------------------- الإحصاء
  const stats = useMemo(() => {
    let filled = 0, empty = 0, over = 0, invalid = 0;
    const acc: { first: { key: string; kind: string } | null } = { first: null };
    const rowsMissing = new Set<string>();
    data.students.forEach((s) => editableComps.forEach((c) => {
      const st = cellState(values[k(s.id, c.id)], c.max_score, verbal);
      if (st === 'ok' || st === 'absent') filled++;
      else {
        if (st === 'empty') { empty++; rowsMissing.add(s.id); }
        if (st === 'over') over++;
        if (st === 'invalid') invalid++;
        if (!acc.first || (acc.first.kind === 'empty' && st !== 'empty')) acc.first = { key: k(s.id, c.id), kind: st };
      }
    }));
    const total = data.students.length * editableComps.length;
    return { filled, empty, over, invalid, total, rowsMissing: rowsMissing.size, first: acc.first, pct: total ? Math.round((filled / total) * 100) : 0 };
  }, [values, data.students, editableComps, verbal]);

  const focusCell = (key: string) => {
    const el = tableRef.current?.querySelector<HTMLElement>(`[data-key="${key}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => el?.focus(), 250);
  };

  const setCell = (key: string, patch: Partial<Cell>) =>
    setValues((v) => ({ ...v, [key]: { ...(v[key] ?? { raw: '', absent: false, level: null }), ...patch } }));

  const onRawChange = (key: string, raw: string) => {
    if (ABSENT.test(raw)) setCell(key, { raw: '', absent: true });
    else setCell(key, { raw: raw.replace(/[^\d٠-٩۰-۹.,٫]/g, ''), absent: false });
  };

  const onKey = (e: React.KeyboardEvent<HTMLElement>, r: number, c: number) => {
    const go = (dr: number, dc: number) => {
      const el = tableRef.current?.querySelector<HTMLElement>(`[data-pos="${r + dr}-${c + dc}"]`);
      if (el) { e.preventDefault(); el.focus(); (el as HTMLInputElement).select?.(); }
    };
    if (e.key === 'Enter' || e.key === 'ArrowDown') go(1, 0);
    else if (e.key === 'ArrowUp') go(-1, 0);
  };

  // ---------------------------------------------------------------- الحفظ
  const finish = async () => {
    setShowErrors(true);
    if (stats.over || stats.invalid) {
      toast.error(stats.over ? `يوجد ${stats.over} درجة أعلى من العظمى` : `يوجد ${stats.invalid} قيمة غير صحيحة`, 'صحّحي الخانات المظللة بالأحمر');
      if (stats.first) focusCell(stats.first.key);
      return;
    }
    if (stats.empty) { setMissingOpen(true); return; }
    const ok = await confirm({
      title: 'تأكيد اكتمال الرصد',
      message: <>تم رصد جميع الطلاب (<b>{data.students.length}</b>) في {editableComps.map((c) => c.name).join('، ')}.<br />الخطوة التالية: مراجعة الكشف قبل الحفظ.</>,
      confirmText: 'مراجعة الكشف',
    });
    if (ok) { setPhase('review'); scrollAppTop(); }
  };

  const doSave = async () => {
    const ok = await confirm({
      title: 'الحفظ النهائي',
      tone: 'success',
      message: role === 'teacher'
        ? <>بعد الحفظ يمكنك تعديل الكشف لمدة <b>{data.meta.edit_window_days} أيام</b>، بعدها يُقفل ويحتاج طلب فتح من المشرفة.</>
        : 'سيتم حفظ الكشف وتسجيل التعديل باسمك في سجل التتبع.',
      confirmText: 'حفظ الكشف',
    });
    if (!ok) return;
    const entries = data.students.flatMap((s) => editableComps.map((c) => {
      const v = values[k(s.id, c.id)];
      if (v?.absent) return { student_id: s.id, component_id: c.id, is_absent: true };
      return verbal
        ? { student_id: s.id, component_id: c.id, verbal_level_id: v?.level ?? null }
        : { student_id: s.id, component_id: c.id, score: Number(normalizeDigits(v?.raw ?? '')) };
    }));
    const r = await exec(() => saveSheet(data.meta.section_id, data.meta.grade_subject_id, data.meta.term, entries), { refresh: false });
    if (r?.ok && r.data) {
      try { localStorage.removeItem(draftKey); } catch { /* */ }
      setSaved(r.data); setPhase('done');
      scrollAppTop();
      const fresh = await loadSheet(data.meta.section_id, data.meta.grade_subject_id, data.meta.term);
      if (fresh.ok && fresh.data) setData(fresh.data);
    } else if (r && !r.ok) {
      setPhase('entry');
    }
  };

  const reload = async () => {
    const fresh = await loadSheet(data.meta.section_id, data.meta.grade_subject_id, data.meta.term);
    if (fresh.ok && fresh.data) setData(fresh.data);
  };

  // --------------------------------------------------------- الطلاب
  const addStudent = async (mode: 'now' | 'request') => {
    const payload = { full_name: newStudent.full_name, gender: (newStudent.gender || null) as 'male' | 'female' | null, national_id: newStudent.national_id, student_number: newStudent.student_number };
    if (mode === 'now') {
      const r = await exec(() => teacherAddStudent(data.meta.section_id, payload), {
        confirm: { title: 'إضافة الطالب للكشف', message: <>سيُضاف <b>{payload.full_name || '—'}</b> لـ{secLabel(data.meta.section_name)} مباشرة ويظهر في كشوف كل مواد الشعبة. يصل للمشرفة لتراجع بياناته وتكملها.</>, confirmText: 'إضافة' },
        success: 'تمت إضافة الطالب', refresh: false,
      });
      if (r?.ok) { setAddOpen(false); await reload(); }
    } else {
      const r = await exec(() => createRequest({ type: 'add_student', section_id: data.meta.section_id, grade_subject_id: data.meta.grade_subject_id, payload }), {
        confirm: { title: 'إرسال طلب للمشرفة', message: `طلب إضافة ${payload.full_name || 'طالب'} ل${secLabel(data.meta.section_name)}.`, confirmText: 'إرسال الطلب' },
        success: 'تم إرسال الطلب للمشرفة', refresh: false,
      });
      if (r?.ok) setAddOpen(false);
    }
  };

  const doExclude = async () => {
    if (!excludeFor) return;
    if (excludeReason === RELEASE) {
      const rr = await exec(() => releaseStudents(data.meta.section_id, [excludeFor.id]), {
        confirm: { title: 'إرجاع الطالب لقائمة الصف', tone: 'danger', confirmText: 'إرجاع',
          message: <><b>{excludeFor.full_name}</b> سيخرج من {secLabel(data.meta.section_name)} في كل المواد، ويعود لقائمة طلاب {data.meta.grade_name}. يصل للمشرفة لتنقله لشعبته الصحيحة.</> },
        success: 'تم إرجاع الطالب لقائمة الصف', refresh: false,
      });
      if (rr?.ok) { setExcludeFor(null); await reload(); }
      return;
    }
    const r = await exec(() => excludeStudent(excludeFor.id, data.meta.grade_subject_id, excludeReason), {
      confirm: { title: 'استبعاد الطالب من الكشف', tone: 'danger', confirmText: 'استبعاد',
        message: <><b>{excludeFor.full_name}</b> لن يظهر في كشف {data.meta.subject_name}. يصل الاستبعاد للمشرفة لتراجعه، ويمكنك إعادته لاحقاً.</> },
      success: 'تم استبعاد الطالب', refresh: false,
    });
    if (r?.ok) { setExcludeFor(null); await reload(); }
  };

  const doRestore = async (s: { id: string; full_name: string }) => {
    const r = await exec(() => restoreStudent(s.id, data.meta.grade_subject_id), {
      confirm: { title: 'إعادة الطالب للكشف', message: `سيظهر ${s.full_name} في الكشف ويجب رصده.`, confirmText: 'إعادة' },
      success: 'تمت إعادة الطالب', refresh: false,
    });
    if (r?.ok) await reload();
  };

  const requestUnlock = async () => {
    const r = await exec(() => createRequest({ type: 'unlock_sheet', section_id: data.meta.section_id, grade_subject_id: data.meta.grade_subject_id, note: unlockNote }), {
      success: 'تم إرسال طلب الفتح للمشرفة', refresh: false,
    });
    if (r?.ok) { setUnlockOpen(false); setData((d) => ({ ...d, pendingUnlock: true })); }
  };

  // ============================================================== العرض
  const header = (
    <div className="card mb-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <button onClick={onBack} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-ink-soft hover:text-ink" aria-label="رجوع">
          <ArrowRight className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-semibold leading-tight sm:text-[21px]">{data.meta.subject_name}</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            {data.meta.grade_name} · {secLabel(data.meta.section_name)} · الترم {data.meta.term === 1 ? 'الأول' : 'الثاني'}
            {role !== 'teacher' && ` · ${data.meta.branch_name}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <a href={`/api/export?type=subject&section=${data.meta.section_id}&subject=${data.meta.grade_subject_id}&term=${data.meta.term}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-[12px] text-ink-soft hover:border-ink-faint" title="تحميل الكشف إكسل">
            <Download className="h-3.5 w-3.5" />إكسل
          </a>
          {comps.map((c) => {
            const left = c.deadline ? timeLeft(c.deadline) : null;
            return !c.submitted_at ? null : c.editable
              ? <Badge key={c.id} tone="info" icon={<Clock className="h-3.5 w-3.5" />}>{comps.length > 1 ? `${c.name}: ` : ''}يُقفل بعد {left}</Badge>
              : <Badge key={c.id} tone="neutral" icon={<Lock className="h-3.5 w-3.5" />}>{comps.length > 1 ? `${c.name}: ` : ''}مقفل</Badge>;
          })}
        </div>
      </div>
      {phase === 'entry' && editableComps.length > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <Bar value={stats.pct} className="flex-1" />
          <span className="num whitespace-nowrap text-[12.5px] text-ink-soft">{stats.filled} من {stats.total}</span>
        </div>
      )}
    </div>
  );

  if (phase === 'done' && saved) {
    return (
      <div>
        {header}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card flex flex-col items-center px-6 py-12 text-center">
          <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.1 }}
            className="grid h-20 w-20 place-items-center rounded-full bg-mint-soft text-mint">
            <CheckCircle2 className="h-10 w-10" />
          </motion.span>
          <h2 className="mt-5 text-[21px] font-semibold">تم حفظ الكشف</h2>
          <p className="mt-2 max-w-md text-[14px] leading-7 text-ink-muted">
            حُفظت <b className="num text-ink">{saved.saved}</b> درجة لـ <b className="num text-ink">{saved.students}</b> طالب.
            {role === 'teacher' && ` يمكنك التعديل من سجلات الرصد خلال ${data.meta.edit_window_days} أيام.`}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={onBack}><ClipboardCheck className="h-4 w-4" />كشف آخر</Button>
            {role === 'teacher' && <Link href="/records" className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-white px-5 text-[14px]"><History className="h-4 w-4" />سجلات الرصد</Link>}
            <Button variant="ghost" onClick={() => { setValues(fromServer(data)); setPhase('entry'); setShowErrors(false); }}><PencilLine className="h-4 w-4" />عرض الكشف</Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div>
      {header}

      <AnimatePresence>
        {phase === 'entry' && closed && (
          <Banner tone="danger" icon={<Lock className="h-4 w-4" />}>الرصد مغلق حالياً من الإدارة. يمكنك الاطلاع على الكشف فقط.</Banner>
        )}
        {phase === 'entry' && !closed && role === 'teacher' && lockedComps.length > 0 && (
          <Banner tone="neutral" icon={<Lock className="h-4 w-4" />}
            action={data.pendingUnlock
              ? <Badge tone="warning">الطلب قيد المراجعة</Badge>
              : <Button size="sm" variant="secondary" onClick={() => setUnlockOpen(true)}><Send className="h-4 w-4" />طلب فتح للتعديل</Button>}>
            انتهت مدة تعديل {lockedComps.map((c) => c.name).join('، ')}.
          </Banner>
        )}
        {phase === 'entry' && role === 'supervisor' && (
          <Banner tone="neutral" icon={<Info className="h-4 w-4" />}>عرض فقط — المشرفة لا تعدّل الدرجات.</Banner>
        )}
        {phase === 'entry' && role !== 'supervisor' && data.poolCount > 0 && data.students.length > 0 && (
          <Banner tone="info" icon={<UserPlus className="h-4 w-4" />}
            action={<Button size="sm" onClick={() => setPoolOpen(true)}>اختيار طلاب شعبتي</Button>}>
            يوجد <b className="num">{data.poolCount}</b> طالب في {data.meta.grade_name} بدون شعبة. اختاري منهم طلاب شعبتك.
          </Banner>
        )}
        {phase === 'entry' && draftRestored && (
          <Banner tone="info" icon={<RotateCcw className="h-4 w-4" />}
            action={<Button size="sm" variant="ghost" onClick={discardDraft}>تجاهل المسودة</Button>}>
            تم استعادة رصد غير محفوظ من آخر جلسة.
          </Banner>
        )}
        {phase === 'entry' && showErrors && (stats.over > 0 || stats.invalid > 0) && (
          <Banner tone="danger" icon={<AlertTriangle className="h-4 w-4" />}
            action={stats.first && <Button size="sm" variant="secondary" onClick={() => focusCell(stats.first!.key)}>انتقال للخطأ</Button>}>
            {stats.over > 0 && `${stats.over} درجة أعلى من العظمى. `}{stats.invalid > 0 && `${stats.invalid} قيمة غير صحيحة (المسموح: أرقام وكسور ربع ونصف).`}
          </Banner>
        )}
        {phase === 'review' && (
          <Banner tone="info" icon={<ClipboardCheck className="h-4 w-4" />}>راجعي الكشف جيداً قبل الحفظ النهائي. للتعديل اضغطي «رجوع للتعديل».</Banner>
        )}
      </AnimatePresence>

      {phase === 'review' && <ReviewSummary data={data} comps={editableComps} values={values} verbal={verbal} />}

      {phase === 'entry' && editableComps.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-muted">
          <Info className="h-4 w-4" />
          {verbal ? 'اختاري المستوى لكل طالب، أو «غائب».' : <>اكتبي الدرجة، و<b className="text-ink">0</b> للصفر، و<b className="text-ink">غ</b> للغائب. Enter ينقلك للطالب التالي.</>}
        </div>
      )}

      {/* الجدول */}
      <div ref={tableRef} className="card overflow-hidden">
        {data.students.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-peri-soft text-peri-deep"><UserPlus className="h-6 w-6" /></span>
            <p className="text-[15px] font-medium">لا يوجد طلاب في هذه الشعبة بعد</p>
            {data.poolCount > 0 && role !== 'supervisor' ? (
              <>
                <p className="mt-1 max-w-sm text-[13px] leading-6 text-ink-muted">يوجد <b className="num text-ink">{data.poolCount}</b> طالب في {data.meta.grade_name} لم تُحدد شعبتهم. اختاري طلاب شعبتك لتبدئي الرصد.</p>
                <Button className="mt-5" onClick={() => setPoolOpen(true)}><UserPlus className="h-4 w-4" />اختيار طلاب شعبتي</Button>
              </>
            ) : <p className="mt-1 text-[13px] text-ink-muted">تواصلي مع المشرفة لإضافة الطلاب، أو أضيفي طالباً جديداً.</p>}
            {editableComps.length > 0 && (
              <Button variant="ghost" className="mt-2" onClick={() => { setNewStudent({ full_name: '', gender: '', national_id: '', student_number: '' }); setAddOpen(true); }}>
                إضافة طالب جديد غير مسجّل
              </Button>
            )}
          </div>
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-[14px]">
              <thead>
                <tr className="text-[12.5px] text-ink-muted">
                  <th className="sticky right-0 z-10 w-8 min-w-[2rem] border-b border-line bg-white px-1 py-3 text-center font-medium sm:w-10 sm:min-w-[2.5rem] sm:px-3">م</th>
                  <th className="sticky right-8 z-10 min-w-[112px] border-b border-l border-line bg-white px-2 py-3 text-right font-medium sm:right-10 sm:min-w-[220px]">الطالب</th>
                  {comps.map((c) => (
                    <th key={c.id} className={cn('border-b border-line px-1 py-3 text-center font-medium sm:px-2', verbal ? 'min-w-[120px]' : 'min-w-[62px] sm:min-w-[82px]')}>
                      <span className="block text-[11.5px] leading-4 text-ink-soft sm:whitespace-nowrap sm:text-[12.5px]">{c.name}</span>
                      {!verbal && <span className="num mt-0.5 block text-[11.5px]">من {c.max_score}</span>}
                    </th>
                  ))}
                  {!verbal && comps.length > 1 && (
                    <th className="border-b border-line px-2 py-3 text-center font-medium">
                      <span className="block">المجموع</span>
                      <span className="num mt-0.5 block text-[11.5px]">من {comps.reduce((a, c) => a + (c.max_score ?? 0), 0)}</span>
                    </th>
                  )}
                  {phase === 'entry' && role !== 'supervisor' && <th className="w-10 border-b border-line" />}
                </tr>
              </thead>
              <tbody>
                {data.students.map((s, ri) => {
                  const missingRow = showErrors && editableComps.some((c) => cellState(values[k(s.id, c.id)], c.max_score, verbal) === 'empty');
                  const rowComplete = comps.every((c) => { const st = cellState(values[k(s.id, c.id)], c.max_score, false); return st === 'ok' || st === 'absent'; });
                  const total = comps.reduce((a, c) => {
                    const v = values[k(s.id, c.id)];
                    return a + (v && !v.absent && cellState(v, c.max_score, false) === 'ok' ? Number(normalizeDigits(v.raw)) : 0);
                  }, 0);
                  return (
                    <tr key={s.id} className={missingRow ? 'bg-[#FDF7EA]' : 'bg-white'}>
                      <td className={cn('num sticky right-0 z-[1] w-8 min-w-[2rem] border-b border-line px-1 py-2 text-center text-[12px] text-ink-muted sm:w-10 sm:min-w-[2.5rem] sm:px-3 sm:text-[12.5px]', missingRow ? 'bg-[#FDF7EA]' : 'bg-white')}>{ri + 1}</td>
                      <td className={cn('sticky right-8 z-[1] border-b border-l border-line px-2 py-2 sm:right-10', missingRow ? 'bg-[#FDF7EA]' : 'bg-white')}>
                        <span className="line-clamp-2 text-[13.5px] font-medium leading-5 sm:text-[14px]">{s.full_name}</span>
                        {s.needs_review && <span className="text-[11px] text-peri-deep">أُضيف من المعلمة</span>}
                      </td>
                      {comps.map((c, ci) => {
                        const key = k(s.id, c.id);
                        const v = values[key];
                        const st = cellState(v, c.max_score, verbal);
                        const canEdit = phase === 'entry' && editable(c);
                        const bad = showErrors && canEdit && st !== 'ok' && st !== 'absent';
                        return (
                          <td key={c.id} className="border-b border-line px-1 py-2 text-center sm:px-1.5">
                            {verbal ? (
                              <VerbalCell value={v} levels={data.levels} disabled={!canEdit} bad={bad} dataKey={key} pos={`${ri}-${ci}`}
                                pills={comps.length === 1 && data.levels.length <= 5}
                                onChange={(level, absent) => setCell(key, { level, absent })} onKey={(e) => onKey(e, ri, ci)} />
                            ) : canEdit ? (
                              v?.absent ? (
                                <button data-key={key} data-pos={`${ri}-${ci}`} onKeyDown={(e) => onKey(e, ri, ci)}
                                  onClick={() => setCell(key, { absent: false, raw: '' })}
                                  className="mx-auto flex h-10 w-full max-w-[54px] items-center sm:w-[66px] justify-center gap-1 rounded-xl bg-surface text-[12.5px] text-ink-soft ring-1 ring-line" title="اضغطي لإلغاء الغياب">
                                  غائب <Undo2 className="h-3 w-3" />
                                </button>
                              ) : (
                                <input
                                  data-key={key} data-pos={`${ri}-${ci}`}
                                  inputMode="decimal" autoComplete="off" enterKeyHint="next"
                                  value={v?.raw ?? ''}
                                  onChange={(e) => onRawChange(key, e.target.value)}
                                  onKeyDown={(e) => onKey(e, ri, ci)}
                                  onFocus={(e) => e.target.select()}
                                  aria-label={`${s.full_name} — ${c.name}`}
                                  aria-invalid={st === 'over' || st === 'invalid'}
                                  className={cn('num mx-auto block h-10 w-full min-w-[46px] max-w-[54px] rounded-xl border sm:max-w-[66px] bg-white text-center text-[15px] font-medium outline-none transition focus:ring-4',
                                    st === 'over' || st === 'invalid' ? 'border-rose bg-rose-soft text-rose focus:ring-rose/15'
                                      : bad ? 'border-amber bg-amber-soft focus:ring-amber/20'
                                      : 'border-line focus:border-peri focus:ring-peri/15')}
                                />
                              )
                            ) : (
                              <ReadCell v={v} verbal={false} levels={data.levels} max={c.max_score} />
                            )}
                            {canEdit && st === 'over' && <span className="mt-1 block text-[10.5px] text-rose">أعلى من {c.max_score}</span>}
                          </td>
                        );
                      })}
                      {!verbal && comps.length > 1 && (
                        <td className="num border-b border-line px-2 py-2 text-center text-[14px] font-semibold">{rowComplete ? total : <span className="text-ink-faint">—</span>}</td>
                      )}
                      {phase === 'entry' && role !== 'supervisor' && (
                        <td className="border-b border-line px-1 py-2 text-center">
                          {editableComps.length > 0 && (
                            <button onClick={() => setExcludeFor(s)} className="rounded-full p-2 text-ink-faint transition hover:bg-rose-soft hover:text-rose" aria-label={`استبعاد ${s.full_name}`} title="استبعاد من الكشف">
                              <UserMinus className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* الطلاب المستبعدون */}
      {data.excluded.length > 0 && phase === 'entry' && (
        <div className="card mt-3 overflow-hidden">
          <button onClick={() => setShowExcluded((v) => !v)} className="flex w-full items-center gap-2 px-5 py-3.5 text-right text-[13.5px]">
            <UserMinus className="h-4 w-4 text-ink-muted" />
            طلاب مستبعدون من هذا الكشف ({data.excluded.length})
            <ChevronDown className={cn('mr-auto h-4 w-4 transition', showExcluded && 'rotate-180')} />
          </button>
          <AnimatePresence initial={false}>
            {showExcluded && (
              <motion.ul initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="divide-y divide-line overflow-hidden border-t border-line">
                {data.excluded.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px]">{s.full_name}</p>
                      {s.reason && <p className="truncate text-[12px] text-ink-muted">{s.reason}</p>}
                    </div>
                    {role !== 'supervisor' && <Button size="sm" variant="ghost" onClick={() => doRestore(s)}><Undo2 className="h-4 w-4" />إعادة</Button>}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* شريط الإجراءات */}
      {editableComps.length > 0 && data.students.length > 0 && (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-20 mt-4 lg:bottom-4">
          <div className="flex flex-wrap items-center gap-2 rounded-card bg-white p-3 shadow-pop ring-1 ring-line lg:bg-white/95 lg:backdrop-blur">
            {phase === 'entry' ? (
              <>
                <Button onClick={finish} size="lg" className="flex-1 sm:flex-none"><ClipboardCheck className="h-4 w-4" />إنهاء الرصد</Button>
                <Button variant="secondary" size="lg" onClick={() => { setNewStudent({ full_name: '', gender: '', national_id: '', student_number: '' }); setAddOpen(true); }}>
                  <UserPlus className="h-4 w-4" /><span className="hidden sm:inline">طالب غير موجود</span>
                </Button>
                {stats.empty > 0 && <span className="num mr-auto hidden text-[13px] text-ink-muted sm:inline">متبقي {stats.empty} خانة</span>}
              </>
            ) : (
              <>
                <Button onClick={doSave} loading={busy} size="lg" className="flex-1 sm:flex-none"><Save className="h-4 w-4" />تأكيد وحفظ</Button>
                <Button variant="secondary" size="lg" onClick={() => setPhase('entry')}><PencilLine className="h-4 w-4" />رجوع للتعديل</Button>
              </>
            )}
          </div>
        </div>
      )}

      <PoolPicker open={poolOpen} onClose={() => setPoolOpen(false)} sectionId={data.meta.section_id}
        sectionName={data.meta.section_name} gradeName={data.meta.grade_name} onClaimed={reload} />

      {/* لم يكتمل */}
      <Dialog open={missingOpen} onClose={() => setMissingOpen(false)} size="sm" title="لم يكتمل الرصد"
        description={<span className="num">يوجد <b className="text-ink">{stats.empty}</b> خانة فارغة لـ <b className="text-ink">{stats.rowsMissing}</b> طالب (مظللة بالأصفر).</span>}
        footer={<>
          <Button onClick={() => { setMissingOpen(false); if (stats.first) focusCell(stats.first.key); }}>انتقلي لأول خانة فارغة</Button>
          <Button variant="secondary" onClick={() => setMissingOpen(false)}>حسناً</Button>
        </>}>
        <div className="space-y-2 pb-2 text-[13.5px] leading-7 text-ink-soft">
          <p className="rounded-xl bg-surface p-3">لا يُحفظ الكشف إلا بعد رصد كل الطلاب.</p>
          {!verbal && <p>• إذا كان الطالب يستحق <b className="text-ink">صفراً</b> اكتبي <b className="text-ink">0</b> صراحةً.</p>}
          <p>• إذا كان الطالب <b className="text-ink">غائباً</b> {verbal ? 'اختاري «غائب»' : <>اكتبي <b className="text-ink">غ</b></>}.</p>
          <p>• إذا كان الطالب <b className="text-ink">ليس من شعبتك</b> أرجعيه لقائمة الصف بزر الاستبعاد بجانب اسمه.</p>
        </div>
      </Dialog>

      {/* إضافة طالب */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="طالب غير موجود في الكشف"
        description="أضيفيه مباشرة ببيانات جزئية، أو أرسلي طلباً للمشرفة"
        footer={<>
          <Button loading={busy} onClick={() => addStudent('now')}><UserPlus className="h-4 w-4" />إضافة الآن</Button>
          <Button variant="secondary" loading={busy} onClick={() => addStudent('request')}><Send className="h-4 w-4" />طلب من المشرفة</Button>
        </>}>
        <div className="space-y-4">
          {data.poolCount > 0 && (
            <button onClick={() => { setAddOpen(false); setPoolOpen(true); }}
              className="flex w-full items-center gap-3 rounded-2xl bg-peri-soft p-4 text-right transition hover:bg-peri-tile">
              <UserPlus className="h-5 w-5 shrink-0 text-peri-deep" />
              <span className="flex-1 text-[13.5px] leading-6 text-peri-deep">
                <b>الطالب مسجّل في الصف بدون شعبة؟</b><br />اختاريه من قائمة طلاب {data.meta.grade_name} (<span className="num">{data.poolCount}</span> طالب)
              </span>
            </button>
          )}
          <p className="text-[12.5px] text-ink-muted">أو أضيفي طالباً جديداً غير مسجّل في النظام:</p>
          <Field label="اسم الطالب"><Input value={newStudent.full_name} onChange={(e) => setNewStudent({ ...newStudent, full_name: e.target.value })} placeholder="الاسم ثلاثياً على الأقل" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الجنس">
              <Select value={newStudent.gender} onChange={(e) => setNewStudent({ ...newStudent, gender: e.target.value })}>
                <option value="">غير محدد</option><option value="male">طالب</option><option value="female">طالبة</option>
              </Select>
            </Field>
            <Field label="الرقم الأكاديمي (إن وُجد)"><Input value={newStudent.student_number} onChange={(e) => setNewStudent({ ...newStudent, student_number: e.target.value })} inputMode="numeric" dir="ltr" className="text-right" /></Field>
          </div>
        </div>
      </Dialog>

      {/* استبعاد */}
      <Dialog open={!!excludeFor} onClose={() => setExcludeFor(null)} title="استبعاد طالب من الكشف" description={excludeFor?.full_name}
        footer={<>
          <Button variant="danger" loading={busy} onClick={doExclude}><UserMinus className="h-4 w-4" />استبعاد</Button>
          <Button variant="secondary" onClick={() => setExcludeFor(null)}>إلغاء</Button>
        </>}>
        <div className="space-y-2 pb-2">
          {[RELEASE, 'منقول لمدرسة أخرى', 'معفى من المادة', 'منقطع عن الدراسة'].map((r) => (
            <label key={r} className={cn('flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 text-[14px] transition', excludeReason === r ? 'border-black' : 'border-line')}>
              <input type="radio" name="reason" checked={excludeReason === r} onChange={() => setExcludeReason(r)} className="accent-black" />{r}
            </label>
          ))}
          <Input placeholder="سبب آخر" onChange={(e) => setExcludeReason(e.target.value)} onFocus={(e) => setExcludeReason(e.target.value)} />
          <p className="pt-1 text-[12px] leading-5 text-ink-muted">
            {excludeReason === RELEASE ? 'يخرج الطالب من شعبتك في كل المواد ويعود لقائمة طلاب الصف.' : `يُستبعد الطالب من كشف ${data.meta.subject_name} فقط ويبقى في الشعبة.`}
          </p>
        </div>
      </Dialog>

      {/* طلب فتح */}
      <Dialog open={unlockOpen} onClose={() => setUnlockOpen(false)} title="طلب فتح الكشف للتعديل"
        description={`${data.meta.subject_name} · ${data.meta.grade_name} ${secLabel(data.meta.section_name)}`}
        footer={<>
          <Button loading={busy} onClick={requestUnlock}><Send className="h-4 w-4" />إرسال الطلب</Button>
          <Button variant="secondary" onClick={() => setUnlockOpen(false)}>إلغاء</Button>
        </>}>
        <Field label="سبب التعديل">
          <textarea rows={3} value={unlockNote} onChange={(e) => setUnlockNote(e.target.value)} className="field h-auto py-2.5 leading-7" placeholder="مثال: خطأ في درجة طالبين في الاختبار النهائي" />
        </Field>
      </Dialog>
    </div>
  );
}

// ======================================================================
function Banner({ tone, icon, action, children }: { tone: 'danger' | 'info' | 'neutral'; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <div className={cn('mb-3 flex flex-wrap items-center gap-3 rounded-card px-4 py-3 text-[13.5px]',
        tone === 'danger' ? 'bg-rose-soft text-rose' : tone === 'info' ? 'bg-peri-soft text-peri-deep' : 'bg-white text-ink-soft ring-1 ring-line')}>
        {icon}<span className="flex-1">{children}</span>{action}
      </div>
    </motion.div>
  );
}

function VerbalCell({ value, levels, disabled, bad, onChange, pills, dataKey, pos, onKey }: {
  value?: Cell; levels: { id: string; label: string }[]; disabled: boolean; bad: boolean; pills: boolean;
  dataKey: string; pos: string; onChange: (level: string | null, absent: boolean) => void; onKey: (e: React.KeyboardEvent<HTMLElement>) => void;
}) {
  if (disabled) return <ReadCell v={value} verbal levels={levels} max={null} />;
  const cur = value?.absent ? '__absent' : value?.level ?? '';
  if (pills) {
    return (
      <div className={cn('mx-auto flex max-w-[420px] flex-wrap justify-center gap-1 rounded-2xl p-1', bad && 'bg-amber-soft ring-1 ring-amber')} data-key={dataKey} tabIndex={-1}>
        {[...levels.map((l) => ({ id: l.id, label: l.label })), { id: '__absent', label: 'غائب' }].map((l, i) => (
          <button key={l.id} type="button" data-pos={i === 0 ? pos : undefined} onKeyDown={onKey}
            onClick={() => onChange(l.id === '__absent' ? null : l.id, l.id === '__absent')}
            className={cn('rounded-full px-3 py-1.5 text-[12.5px] transition',
              cur === l.id ? (l.id === '__absent' ? 'bg-ink-soft text-white' : 'bg-black text-white') : 'bg-surface text-ink-soft hover:bg-peri-soft')}>
            {l.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <select data-key={dataKey} data-pos={pos} value={cur} onKeyDown={onKey}
      onChange={(e) => onChange(e.target.value === '__absent' || !e.target.value ? null : e.target.value, e.target.value === '__absent')}
      className={cn('mx-auto block h-10 min-w-[110px] rounded-xl border bg-white px-2 text-[13px] outline-none focus:border-peri', bad ? 'border-amber bg-amber-soft' : 'border-line')}>
      <option value="">—</option>
      {levels.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
      <option value="__absent">غائب</option>
    </select>
  );
}

function ReadCell({ v, verbal, levels, max }: { v?: Cell; verbal: boolean; levels: { id: string; label: string }[]; max: number | null }) {
  if (!v || (!v.absent && !v.raw && !v.level)) return <span className="text-ink-faint">—</span>;
  if (v.absent) return <span className="rounded-full bg-surface px-2.5 py-1 text-[12px] text-ink-soft">غائب</span>;
  if (verbal) return <span className="text-[13px] font-medium">{levels.find((l) => l.id === v.level)?.label ?? '—'}</span>;
  const n = Number(normalizeDigits(v.raw));
  return <span className={cn('num text-[15px] font-medium', n === 0 && 'text-rose', max !== null && n === max && 'text-mint')}>{v.raw}</span>;
}

function ReviewSummary({ data, comps, values, verbal }: { data: SheetData; comps: SheetData['components']; values: Values; verbal: boolean }) {
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {comps.map((c) => {
        const cells = data.students.map((s) => values[k(s.id, c.id)]);
        const absent = cells.filter((x) => x?.absent).length;
        if (verbal) {
          const counts = data.levels.map((l) => ({ l: l.label, n: cells.filter((x) => !x?.absent && x?.level === l.id).length }));
          return (
            <div key={c.id} className="card p-4">
              <p className="mb-3 text-[14px] font-semibold">{c.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {counts.map((x) => <span key={x.l} className="num rounded-full bg-surface px-2.5 py-1 text-[12.5px]">{x.l}: <b>{x.n}</b></span>)}
                {absent > 0 && <span className="num rounded-full bg-amber-soft px-2.5 py-1 text-[12.5px] text-amber">غائب: <b>{absent}</b></span>}
              </div>
            </div>
          );
        }
        const nums = cells.filter((x) => x && !x.absent).map((x) => Number(normalizeDigits(x!.raw)));
        const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        const zeros = nums.filter((n) => n === 0).length;
        const full = nums.filter((n) => n === c.max_score).length;
        return (
          <div key={c.id} className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[14px] font-semibold">{c.name}</p>
              <span className="num text-[12.5px] text-ink-muted">من {c.max_score}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Mini label="المتوسط" value={avg.toFixed(1)} />
              <Mini label="الأعلى" value={nums.length ? String(Math.max(...nums)) : '—'} />
              <Mini label="الأدنى" value={nums.length ? String(Math.min(...nums)) : '—'} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
              {full > 0 && <span className="num rounded-full bg-mint-soft px-2.5 py-1 text-mint">الدرجة الكاملة: {full}</span>}
              {zeros > 0 && <span className="num rounded-full bg-rose-soft px-2.5 py-1 text-rose">صفر: {zeros}</span>}
              {absent > 0 && <span className="num rounded-full bg-amber-soft px-2.5 py-1 text-amber">غائب: {absent}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface py-2">
      <p className="text-[11.5px] text-ink-muted">{label}</p>
      <p className="num text-[16px] font-semibold">{value}</p>
    </div>
  );
}

