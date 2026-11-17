'use client';
import { useRef, useState } from 'react';
import { Download, UploadCloud, AlertTriangle, CheckCircle2, FileSpreadsheet, RefreshCcw } from 'lucide-react';
import { previewBranchImport, type BranchPreview } from '@/app/actions/branch-import';
import { useAction } from '@/lib/use-action';
import { ExportButton } from '@/components/ui/export-button';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Select } from '@/components/ui/field';
import { cn } from '@/lib/utils';

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

export function BranchImportClient({ branches, currentTerm, year }: { branches: { id: string; name: string }[]; currentTerm: 1 | 2; year: string }) {
  const [branch, setBranch] = useState(branches[0]?.id ?? '');
  const [term, setTerm] = useState<1 | 2>(currentTerm);
  const [file, setFile] = useState<string | null>(null);
  const [pv, setPv] = useState<BranchPreview | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { exec, busy } = useAction();

  const reset = () => { setFile(null); setPv(null); if (input.current) input.current.value = ''; };
  const pick = async (f?: File) => {
    if (!f) return;
    setFile(f.name); setPv(null);
    const r = await exec(async () => previewBranchImport(await toBase64(f), branch, term), { refresh: false });
    if (r?.ok && r.data) setPv(r.data); else { setFile(null); if (input.current) input.current.value = ''; }
  };
  const t = pv?.totals;

  return (
    <div className="space-y-4">
      <div className="card grid gap-4 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="الفرع"><Select value={branch} onChange={(e) => { setBranch(e.target.value); reset(); }}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        <Field label={`الفصل (السنة ${year})`}><Select value={term} onChange={(e) => { setTerm(Number(e.target.value) as 1 | 2); reset(); }}><option value={1}>الفصل الأول</option><option value={2}>الفصل الثاني</option></Select></Field>
        <ExportButton params={{ type: 'branch-template', branch }} label="تحميل ملف الفرع" />
      </div>

      <ol className="card list-decimal space-y-1.5 p-4 ps-9 text-[13.5px] leading-6 text-ink-soft">
        <li>حمّلي «ملف الفرع»: ورقة لكل صف مفتوح، فيها بيانات الطالب وأعمدة درجات مواد الصف الفعّالة لهذا الفرع.</li>
        <li>أرسليه للفرع ليعبّئه، أو عبّئيه أنتِ، ثم ارفعيه هنا.</li>
        <li>تظهر معاينة كاملة: طلاب جدد، موجودون، درجات جديدة، تعارضات، وأخطاء. لا يُحفظ شيء في هذه المرحلة.</li>
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

          <div className="card flex items-start gap-3 bg-surface p-4 text-[13px] leading-6">
            {t.errors ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint" />}
            <p>هذه معاينة فقط ولم يُحفظ شيء. زر الحفظ (مع خيار حماية الدرجات الموجودة، والتراجع عن الدفعة) يُضاف في الخطوة التالية.</p>
          </div>
          <Badge tone="neutral">معاينة فقط</Badge>
        </>
      )}
    </div>
  );
}
