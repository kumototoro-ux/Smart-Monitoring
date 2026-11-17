'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { UploadCloud, AlertTriangle, CheckCircle2, FileSpreadsheet, RefreshCcw, Undo2, Save } from 'lucide-react';
import { previewBranchImport, commitBranchImport, listBranchImports, undoBranchImport, type BranchPreview, type BranchImportLog } from '@/app/actions/branch-import';
import { useAction } from '@/lib/use-action';
import { ExportButton } from '@/components/ui/export-button';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Select, Switch } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, fmtDateTime } from '@/lib/utils';

const toBase64 = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] ?? '');
  r.onerror = rej;
  r.readAsDataURL(f);
});

function Stat({ n, label, tone }: { n: number; label: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <li className="rounded-xl border border-line bg-white p-3 text-center">
      <p className={cn('num text-[20px] font-semibold', tone === 'bad' && n > 0 && 'text-rose', tone === 'warn' && n > 0 && 'text-amber', tone === 'ok' && 'text-mint')}>{n}</p>
      <p className="text-[12px] text-ink-muted">{label}</p>
    </li>
  );
}

export function BranchImportClient({ branches, currentTerm, year, branchGrades, grades }: { branches: { id: string; name: string }[]; currentTerm: 1 | 2; year: string; branchGrades: { branch_id: string; grade_id: string }[]; grades: { id: string; name: string }[] }) {
  const [branch, setBranch] = useState(branches[0]?.id ?? '');
  const [term, setTerm] = useState<1 | 2>(currentTerm);
  const [file, setFile] = useState<string | null>(null);
  const [b64, setB64] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [version, setVersion] = useState(0);
  const [pv, setPv] = useState<BranchPreview | null>(null);
  const [withGrades, setWithGrades] = useState(false);
  const [picked, setPicked] = useState<string[]>([]); // فارغ = كل صفوف الفرع
  const open = grades.filter((g) => branchGrades.some((r) => r.branch_id === branch && r.grade_id === g.id));
  const input = useRef<HTMLInputElement>(null);
  const { exec, busy } = useAction();

  const reset = () => { setFile(null); setB64(null); setOverwrite(false); setPv(null); if (input.current) input.current.value = ''; };
  const pick = async (f?: File) => {
    if (!f) return;
    setFile(f.name); setPv(null);
    const data = await toBase64(f);
    const r = await exec(() => previewBranchImport(data, branch, term), { refresh: false });
    if (r?.ok && r.data) { setPv(r.data); setB64(data); } else { setFile(null); if (input.current) input.current.value = ''; }
  };
  const save = async () => {
    if (!b64 || !pv || !t) return;
    const r = await exec(() => commitBranchImport(b64, branch, term, overwrite, file ?? ''), {
      confirm: {
        title: 'تأكيد حفظ الملف',
        message: <>سيتم في <b>{pv.branch}</b> (الفصل {term === 1 ? 'الأول' : 'الثاني'}): إضافة <b>{t.newStudents}</b> طالب جديد، وتحديث <b>{t.updated + t.adopted}</b> طالب، وحفظ <b>{t.resNew}</b> درجة جديدة{overwrite && t.resConflict ? <>، واستبدال <b>{t.resConflict}</b> درجة مختلفة</> : ''}.{t.errors ? <> وسيُتجاهل <b>{t.errors}</b> صف به أخطاء.</> : ''} يمكن التراجع عن الدفعة كلها من «سجل الاستيراد».</>,
        confirmText: 'حفظ',
      },
      success: (d) => `تم الحفظ: ${d?.students_new ?? 0} طالب جديد و${d?.results_new ?? 0} درجة`,
      refresh: false,
    });
    if (r?.ok) { reset(); setVersion((v) => v + 1); }
  };
  const t = pv?.totals;

  return (
    <div className="space-y-4">
      <div className="card grid gap-4 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="الفرع"><Select value={branch} onChange={(e) => { setBranch(e.target.value); setPicked([]); reset(); }}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        <Field label={`الفصل (السنة ${year})`}><Select value={term} onChange={(e) => { setTerm(Number(e.target.value) as 1 | 2); reset(); }}><option value={1}>الفصل الأول</option><option value={2}>الفصل الثاني</option></Select></Field>
        <ExportButton params={{ type: 'branch-template', branch, scores: withGrades ? '1' : '0', grade: picked.length ? picked.join(',') : undefined }} label={withGrades ? 'تحميل ملف (طلاب + درجات)' : 'تحميل ملف (طلاب فقط)'} />
        <div className="rounded-2xl bg-surface p-3.5 sm:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[14px] font-medium">الصفوف في الملف</p>
            <span className="text-[12.5px] text-ink-muted">{picked.length ? `${picked.length} من ${open.length}` : `كل الصفوف المفتوحة (${open.length})`}</span>
          </div>
          {open.length === 0 ? <p className="text-[13px] text-ink-muted">لا صفوف مفتوحة في هذا الفرع. افتحي الصفوف من صفحة الفروع.</p> : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setPicked([])} className={cn('rounded-full border px-3.5 py-2 text-[13px] transition', picked.length === 0 ? 'border-black bg-black text-white' : 'border-line bg-white text-ink-soft hover:border-ink-faint')}>الكل</button>
              {open.map((g) => {
                const on = picked.includes(g.id);
                return <button key={g.id} type="button" onClick={() => setPicked((p) => on ? p.filter((x) => x !== g.id) : [...p, g.id])}
                  className={cn('rounded-full border px-3.5 py-2 text-[13px] transition', on ? 'border-black bg-black text-white' : 'border-line bg-white text-ink-soft hover:border-ink-faint')}>{g.name}</button>;
              })}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-3.5 sm:col-span-3">
          <div className="min-w-0">
            <p className="text-[14px] font-medium">تضمين أعمدة الدرجات</p>
            <p className="text-[12.5px] text-ink-muted">{withGrades ? 'يتضمن الملف أعمدة درجات مواد كل صف (الفعّالة لهذا الفرع)' : 'مغلق: الملف لبيانات الطلاب فقط. فعّليه إن أردتِ رفع الدرجات مع الطلاب'}</p>
          </div>
          <Switch checked={withGrades} onChange={setWithGrades} label="تضمين الدرجات" />
        </div>
      </div>

      <ol className="card list-decimal space-y-1.5 p-4 ps-9 text-[13.5px] leading-6 text-ink-soft">
        <li>حمّلي «ملف الفرع»: ورقة لكل صف مفتوح فيها بيانات الطالب، وإن فعّلتِ «تضمين أعمدة الدرجات» تُضاف أعمدة درجات مواد الصف الفعّالة لهذا الفرع.</li>
        <li>أرسليه للفرع ليعبّئه، أو عبّئيه أنتِ، ثم ارفعيه هنا.</li>
        <li>تظهر معاينة كاملة: طلاب جدد، موجودون، درجات جديدة، تعارضات، وأخطاء. تحفظين بعد المراجعة، ويمكن التراجع عن كل دفعة.</li>
      </ol>

      {!pv ? (
        <button type="button" disabled={busy || !branch} onClick={() => input.current?.click()}
          className="card flex w-full flex-col items-center gap-2 border-dashed p-10 text-center hover:border-ink-faint disabled:opacity-60">
          {busy ? <FileSpreadsheet className="h-8 w-8 animate-pulse text-ink-muted" /> : <UploadCloud className="h-8 w-8 text-ink-muted" />}
          <span className="text-[14px] font-medium">{busy ? `جارٍ فحص ${file ?? 'الملف'}…` : 'ارفعي ملف الفرع المعبّأ'}</span>
          <span className="text-[12.5px] text-ink-muted">xlsx — حتى 10 ميجا</span>
          <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        </button>
      ) : t && (
        <>
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-[14px] font-medium">{pv.branch} · الفصل {pv.term === 1 ? 'الأول' : 'الثاني'} · {pv.year}</p>
              <p className="truncate text-[12.5px] text-ink-muted">{file} — {t.rows} صف</p>
            </div>
            <Button variant="secondary" onClick={reset}><RefreshCcw className="h-4 w-4" />ملف آخر</Button>
          </div>

          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat n={t.newStudents} label="طلاب جدد" tone="ok" />
            <Stat n={t.updated + t.adopted + t.matched} label="طلاب موجودون" />
            <Stat n={t.resNew} label="درجات جديدة" tone="ok" />
            <Stat n={t.resSame} label="درجات مطابقة (بلا تغيير)" />
            <Stat n={t.resConflict} label="درجات تختلف عن الموجود" tone="warn" />
            <Stat n={t.absent} label="غياب" />
            <Stat n={t.warnings} label="تنبيهات" tone="warn" />
            <Stat n={t.errors} label="صفوف بها أخطاء" tone="bad" />
          </ul>

          <div className="card overflow-hidden"><ul className="divide-y divide-line">
            {pv.sheets.map((s) => (
              <li key={s.name} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13.5px]">
                <span className="font-medium">{s.name}</span>
                <span className="num text-[12.5px] text-ink-muted">{s.rows} طالب · {s.newStudents} جديد · {s.results} درجة{s.errors ? ` · ` : ''}{s.errors ? <b className="text-rose">{s.errors} خطأ</b> : null}</span>
              </li>
            ))}
          </ul></div>

          {pv.newSections.length > 0 && (
            <div className="card p-4 text-[13px] leading-6"><p className="mb-1 font-medium">شعب غير موجودة (ستُنشأ عند الحفظ)</p><p className="text-ink-muted">{pv.newSections.join('، ')}</p></div>
          )}

          {pv.problems.length > 0 && (
            <div className="card p-4">
              <p className="mb-2 flex items-center gap-1.5 text-[13.5px] font-medium text-rose"><AlertTriangle className="h-4 w-4" />أخطاء تمنع حفظ صفوفها ({t.errors})</p>
              <ul className="max-h-80 space-y-2 overflow-y-auto text-[13px] leading-6">
                {pv.problems.map((p, i) => <li key={i} className="rounded-lg bg-rose-soft p-2.5"><b>{p.sheet} · صف {p.row}</b>{p.name ? ` · ${p.name}` : ''}<br />{p.messages.join('، ')}</li>)}
              </ul>
            </div>
          )}

          {pv.conflicts.length > 0 && (
            <div className="card p-4">
              <p className="mb-2 flex items-center gap-1.5 text-[13.5px] font-medium text-amber"><AlertTriangle className="h-4 w-4" />درجات تختلف عمّا في النظام ({pv.conflictTotal}) — لن تُستبدل إلا إذا اخترتِ ذلك عند الحفظ</p>
              <ul className="max-h-80 space-y-1.5 overflow-y-auto text-[13px]">
                {pv.conflicts.map((c, i) => <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-soft px-2.5 py-2"><span><b>{c.name}</b> · {c.label}</span><span className="num">في النظام {c.old} ← في الملف {c.incoming}</span></li>)}
              </ul>
            </div>
          )}

          {pv.warnings.length > 0 && (
            <div className="card p-4">
              <p className="mb-2 text-[13.5px] font-medium">تنبيهات للمراجعة ({t.warnings})</p>
              <ul className="max-h-60 space-y-1.5 overflow-y-auto text-[13px] leading-6 text-ink-soft">
                {pv.warnings.map((p, i) => <li key={i}><b>{p.sheet} · صف {p.row}</b> · {p.name}: {p.messages.join('، ')}</li>)}
              </ul>
            </div>
          )}

          <div className="card space-y-3 p-4">
            {t.resConflict > 0 && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-amber-soft p-3 text-[13px] leading-6">
                <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="mt-1.5 h-4 w-4 accent-black" />
                <span>استبدال الـ <b>{t.resConflict}</b> درجة المختلفة عمّا في النظام بقيم الملف. <span className="text-ink-muted">(الافتراضي: تُحمى الدرجات الموجودة ولا تتغير)</span></span>
              </label>
            )}
            <div className="flex items-start gap-3 text-[13px] leading-6">
              {t.errors ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint" />}
              <p>{t.errors ? `سيُحفظ ${t.valid} صف صالح ويُتجاهل ${t.errors} صف به أخطاء. يمكنكِ تصحيح الملف وإعادة رفعه لاحقًا (الطالب الموجود بنفس الرقم الأكاديمي يُحدَّث ولا يتكرر).` : 'لا أخطاء. الحفظ دفعة واحدة، ويمكن التراجع عنها كلها.'}</p>
            </div>
            <Button loading={busy} disabled={!t.valid} onClick={save}><Save className="h-4 w-4" />حفظ {t.valid} صف</Button>
          </div>
          <Badge tone="neutral">لم يُحفظ شيء حتى تضغطي «حفظ»</Badge>
        </>
      )}

      <History version={version} />
    </div>
  );
}

function History({ version }: { version: number }) {
  const { exec, busy } = useAction();
  const [rows, setRows] = useState<BranchImportLog[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => { const r = await listBranchImports(); if (r.ok && r.data) { setRows(r.data); setErr(null); } else setErr(r.message ?? 'تعذّر تحميل السجل'); }, []);
  useEffect(() => { void load(); }, [load, version]);
  return (
    <section className="pt-2">
      <h2 className="mb-2 text-[15px] font-semibold">سجل الاستيراد والتراجع</h2>
      {err ? <div className="card p-4 text-[13px] text-ink-muted">{err}</div>
        : !rows ? <div className="card space-y-2 p-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        : rows.length === 0 ? <div className="card p-4 text-[13px] text-ink-muted">لا توجد دفعات بعد.</div>
        : (
          <div className="card overflow-hidden"><ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-60">
                  <p className="text-[13.5px] font-medium">{r.branch_name} · الفصل {r.term === 1 ? 'الأول' : 'الثاني'} · {r.academic_year}</p>
                  <p className="num text-[12px] text-ink-muted">{r.created_by_name ?? '—'} · {fmtDateTime(r.created_at)}{r.file_name ? ` · ${r.file_name}` : ''}</p>
                  <p className="num text-[12.5px]">{r.summary.students_new ?? 0} طالب جديد · {r.summary.students_updated ?? 0} محدَّث · {r.summary.results_new ?? 0} درجة جديدة{r.summary.results_overwritten ? ` · ${r.summary.results_overwritten} مستبدلة` : ''}{r.summary.results_skipped ? ` · ${r.summary.results_skipped} محمية` : ''}</p>
                  {r.undone_at && r.undone_summary && <p className="num text-[12px] text-ink-muted">تم التراجع: حُذفت {r.undone_summary.results_deleted ?? 0} درجة و{r.undone_summary.students_deleted ?? 0} طالب{(r.undone_summary.results_kept || r.undone_summary.students_kept) ? `، وبقي ${r.undone_summary.students_kept ?? 0} طالب و${r.undone_summary.results_kept ?? 0} درجة لأنها عُدّلت بعد الاستيراد` : ''}</p>}
                </div>
                {r.undone_at ? <Badge tone="neutral">تم التراجع</Badge> : (
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => void exec(() => undoBranchImport(r.id), {
                    confirm: { title: 'التراجع عن الدفعة', message: <>سيُحذف الطلاب الذين أُضيفوا في هذه الدفعة ودرجاتهم، وتُعاد الدرجات المستبدلة لقيمها القديمة. ما عُدّل بعد الاستيراد يبقى كما هو. هل تريدين التراجع؟</>, confirmText: 'تراجع', tone: 'danger' },
                    success: 'تم التراجع عن الدفعة', refresh: false,
                  }).then(() => load())}><Undo2 className="h-4 w-4" />تراجع</Button>
                )}
              </li>
            ))}
          </ul></div>
        )}
    </section>
  );
}
