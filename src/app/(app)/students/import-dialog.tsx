'use client';
import { useRef, useState } from 'react';
import { FileSpreadsheet, UploadCloud, AlertCircle, CheckCircle2, RefreshCcw, Layers, Download } from 'lucide-react';
import { previewImport, commitImport, type ImportPreview } from '@/app/actions/students';
import { useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select, Switch } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import type { Branch } from '@/lib/types';

const toBase64 = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] ?? '');
  r.onerror = rej;
  r.readAsDataURL(f);
});

export function ImportDialog({ open, onClose, isAdmin, branches, defaultBranch }: {
  open: boolean; onClose: () => void; isAdmin: boolean; branches: Branch[]; defaultBranch: string | null;
}) {
  const [file, setFile] = useState<{ name: string; b64: string } | null>(null);
  const [branch, setBranch] = useState(defaultBranch ?? '');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [createSections, setCreateSections] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const { exec, busy } = useAction();

  const reset = () => { setFile(null); setPreview(null); if (input.current) input.current.value = ''; };
  const close = () => { reset(); onClose(); };

  const pick = async (f?: File) => {
    if (!f) return;
    const b64 = await toBase64(f);
    setFile({ name: f.name, b64 });
    const r = await exec(() => previewImport(b64, branch || null), { refresh: false });
    if (r?.ok && r.data) setPreview(r.data); else setFile(null);
  };

  const commit = async () => {
    if (!file || !preview) return;
    const r = await exec(() => commitImport(file.b64, branch || null, createSections), {
      confirm: {
        title: 'تأكيد الاستيراد',
        message: <>سيتم حفظ <b>{preview.valid}</b> طالب{preview.updates ? `، منهم ${preview.updates} موجودون مسبقاً وستُحدّث بياناتهم` : ''}{preview.errors ? `، وتجاهل ${preview.errors} صف به أخطاء` : ''}.</>,
        confirmText: 'استيراد',
      },
      success: (d) => `تم استيراد ${d?.imported ?? 0} طالب`,
    });
    if (r?.ok) close();
  };

  return (
    <Dialog open={open} onClose={close} size="xl" title="استيراد الطلاب من إكسل"
      description="المطلوب: اسم الطالب والصف. الشعبة اختيارية — الطلاب بدون شعبة تختارهم المعلمات من شاشة الرصد."
      footer={preview ? <>
        <Button loading={busy} disabled={!preview.valid} onClick={commit}>استيراد {preview.valid} طالب</Button>
        <Button variant="secondary" onClick={reset}><RefreshCcw className="h-4 w-4" />ملف آخر</Button>
      </> : undefined}>
      {!preview ? (
        <div className="space-y-4 pb-4">
          <div className="flex flex-col gap-3 rounded-2xl bg-peri-soft p-4 sm:flex-row sm:items-center">
            <div className="flex-1 text-[13px] leading-6 text-peri-deep">
              <p className="font-medium">ابدئي بتحميل النموذج</p>
              <p>فيه قوائم منسدلة بأسماء الفروع والصفوف الموجودة في النظام. الصقي بياناتك فيه ثم ارفعيه هنا.</p>
            </div>
            <a href="/api/export?type=template" download className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-black px-4 text-[13.5px] text-white">
              <Download className="h-4 w-4" />تحميل النموذج
            </a>
          </div>
          {isAdmin && (
            <Field label="الفرع الافتراضي" hint="النظام يقرأ الفرع من عمود «الفرع» في الملف (بالاسم أو الرمز). وإذا كان العمود فارغاً أو غير موجود يُستخدم هذا الفرع. الأسهل: ملف لكل فرع مع اختيار فرعه هنا.">
              <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="">من عمود الفرع في الملف</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
          )}
          <button type="button" disabled={busy} onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void pick(e.dataTransfer.files[0]); }}
            className="flex w-full flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-line bg-surface py-12 text-center transition hover:border-peri">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-peri-deep">
              {busy ? <FileSpreadsheet className="h-7 w-7 animate-pulse" /> : <UploadCloud className="h-7 w-7" />}
            </span>
            <span className="text-[14.5px] font-medium">{busy ? `جارٍ قراءة ${file?.name ?? 'الملف'}…` : 'اختاري ملف الإكسل أو اسحبيه هنا'}</span>
            <span className="text-[12.5px] text-ink-muted">xlsx · حتى 8 ميجا</span>
          </button>
          <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        </div>
      ) : (
        <div className="space-y-4 pb-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="إجمالي الصفوف" value={preview.total} />
            <Stat label="صالحة" value={preview.valid} tone="mint" />
            <Stat label="تحديث موجود" value={preview.updates} tone="peri" />
            <Stat label="بها أخطاء" value={preview.errors} tone={preview.errors ? 'rose' : undefined} />
          </div>
          <div className="flex flex-wrap gap-1.5 text-[12px]">
            {Object.entries(preview.headers).map(([k, v]) => (
              <span key={k} className={cn('rounded-full px-2.5 py-1', v ? 'bg-mint-soft text-mint' : 'bg-surface text-ink-faint')}>
                {({ full_name: 'الاسم', national_id: 'الهوية', student_number: 'رقم الطالب', gender: 'الجنس', branch: 'الفرع', grade: 'الصف', section: 'الشعبة' } as Record<string, string>)[k]}
                {v ? ` ← ${v}` : ' (غير موجود)'}
              </span>
            ))}
          </div>
          {preview.newSections.length > 0 && (
            <div className="rounded-2xl bg-amber-soft p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-[13.5px] font-medium text-amber"><Layers className="h-4 w-4" />{preview.newSections.length} شعبة غير موجودة في النظام</p>
                {isAdmin && <label className="flex items-center gap-2 text-[13px] text-amber">إنشاؤها تلقائياً <Switch checked={createSections} onChange={setCreateSections} /></label>}
              </div>
              <p className="mt-2 text-[12.5px] leading-6 text-amber/90">{preview.newSections.slice(0, 12).join('، ')}{preview.newSections.length > 12 ? ' …' : ''}</p>
            </div>
          )}
          <div className="max-h-[38vh] overflow-auto rounded-2xl ring-1 ring-line scrollbar-thin">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-surface text-ink-muted">
                <tr>{['الصف في الملف', 'الاسم', 'الهوية', 'الصف', 'الشعبة', 'الحالة'].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2.5 text-right font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.rows.map((r) => (
                  <tr key={r.row} className={r.error ? 'bg-rose-soft/50' : ''}>
                    <td className="num px-3 py-2 text-ink-muted">{r.row}</td>
                    <td className="whitespace-nowrap px-3 py-2">{r.full_name}</td>
                    <td className="num px-3 py-2" dir="ltr">{r.national_id ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{r.grade || '—'}</td>
                    <td className="px-3 py-2">{r.section || '—'}</td>
                    <td className="px-3 py-2">
                      {r.error ? <span className="inline-flex items-center gap-1 text-rose"><AlertCircle className="h-3.5 w-3.5" />{r.error}</span>
                        : r.existing ? <span className="text-peri-deep">تحديث</span>
                        : <span className="inline-flex items-center gap-1 text-mint"><CheckCircle2 className="h-3.5 w-3.5" />جديد</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.total > preview.rows.length && <p className="text-[12px] text-ink-muted">يُعرض أول {preview.rows.length} صف (الأخطاء أولاً).</p>}
        </div>
      )}
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'mint' | 'rose' | 'peri' }) {
  return (
    <div className={cn('rounded-2xl p-3', tone === 'mint' ? 'bg-mint-soft' : tone === 'rose' ? 'bg-rose-soft' : tone === 'peri' ? 'bg-peri-soft' : 'bg-surface')}>
      <p className="text-[12px] text-ink-muted">{label}</p>
      <p className="num text-[20px] font-semibold">{value.toLocaleString('en')}</p>
    </div>
  );
}
