'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Eye, ImagePlus, Trash2, Check } from 'lucide-react';
import {
  loadNoticeAssets, removeNoticeImage, saveEnglishNames, saveNoticeBranch, saveNoticeSettings, setClassTeacher, uploadNoticeImage,
} from '@/app/actions/notices';
import { useAction } from '@/lib/use-action';
import { useConfirm } from '@/components/ui/confirm';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Switch } from '@/components/ui/field';
import { NoticePreview } from '@/components/notice/notice-sheet';
import {
  BRANCH_DEFAULTS, NOTICE_IMAGES, levelEn, resolveRender,
  type NoticeBranch, type NoticeBrand, type NoticeData, type NoticeImageKind, type NoticeSettings,
} from '@/lib/notice';
import { cn, secLabel } from '@/lib/utils';

export interface SectionRow { id: string; name: string; branch_id: string; grade: string; sort: number; teacher_id: string | null }
export interface TeacherRow { id: string; full_name: string; branch_id: string | null }

type Tab = 'general' | 'branches' | 'homeroom' | 'english' | 'access';
const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'الترويسة والعنوان' },
  { key: 'branches', label: 'الفروع والمديرات' },
  { key: 'homeroom', label: 'مربيات الفصول' },
  { key: 'english', label: 'الأسماء الإنجليزية' },
  { key: 'access', label: 'الإصدار والصلاحيات' },
];

const DEMO_SUBJECTS: [string, string, number, number][] = [
  ['القرآن الكريم', 'Holy Quran', 48, 50], ['التربية الإسلامية', 'Islamic Studies', 44, 50], ['اللغة العربية', 'Arabic', 92, 100],
  ['اللغة الإنجليزية', 'English', 85, 100], ['الرياضيات', 'Mathematics', 96, 100], ['العلوم', 'Science', 78, 100], ['الاجتماعيات', 'Social Studies', 39, 50],
];
function demo(school: string, year: string, branch: string): NoticeData {
  return {
    student: { id: 'demo', name: 'محمد عبدالله الأحمد', name_en: 'Mohammed Abdullah Alahmad', national_id: '1234567890', number: '20240137', birth_date: '2018/03/04', nationality: 'سعودي', gender: 'male' },
    branch: { id: 'demo', name: branch, code: null },
    grade: { name: 'الأول الابتدائي', name_en: 'Grade 1', mode: 'numeric', stage: 'الابتدائية' },
    section: 'أ', homeroom: 'أ. سارة العتيبي', term: 1, year, school, missing: [], complete: true,
    subjects: DEMO_SUBJECTS.map(([name, name_en, total, max], i) => ({ id: `d${i}`, name, name_en, max, total, recorded: 3, comps: 3, absent: false, level: null })),
  };
}

/** يصغّر الصورة الكبيرة قبل الرفع (يحافظ على الشفافية) */
async function shrink(file: File): Promise<File> {
  if (file.size <= 850 * 1024) return file;
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const png = file.type !== 'image/jpeg';
  const blob: Blob | null = await new Promise((r) => c.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.9));
  return blob ? new File([blob], file.name, { type: blob.type }) : file;
}

function ImageSlot({ kind, scope, brand, owned, onChanged }: {
  kind: NoticeImageKind; scope: string; brand: NoticeBrand; owned: boolean; onChanged: (has: boolean) => void;
}) {
  const meta = NOTICE_IMAGES.find((i) => i.kind === kind)!;
  const input = useRef<HTMLInputElement>(null);
  const { exec, busy } = useAction();
  const confirm = useConfirm();
  const src = brand[kind];
  const pick = async (f: File | undefined) => {
    if (!f) return;
    let file = f;
    try { file = await shrink(f); } catch { /* يُرفع كما هو */ }
    const fd = new FormData();
    fd.set('scope', scope); fd.set('kind', kind); fd.set('file', file);
    const r = await exec(() => uploadNoticeImage(fd), { success: `تم رفع ${meta.ar}`, refresh: false });
    if (r?.ok) onChanged(true);
    if (input.current) input.current.value = '';
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line p-3">
      <div className="grid h-16 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface">
        {src ? <img src={src} alt="" className="max-h-full max-w-full object-contain" /> : <ImagePlus className="h-5 w-5 text-ink-faint" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium">{meta.ar}</p>
        <p className="text-[12px] leading-5 text-ink-muted">
          {src ? (scope === 'global' || owned ? 'مرفوعة' : 'من الإعداد العام') : 'غير مرفوعة'} · {meta.hint}
        </p>
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <div className="flex shrink-0 gap-1.5">
        <Button size="sm" variant="secondary" loading={busy} onClick={() => input.current?.click()}>{src && (scope === 'global' || owned) ? 'تغيير' : 'رفع'}</Button>
        {(scope === 'global' || owned) && src && (
          <Button size="sm" variant="ghost" className="text-rose" aria-label="حذف" disabled={busy}
            onClick={async () => {
              if (!(await confirm({ title: `حذف ${meta.ar}`, message: scope === 'global' ? 'ستُحذف الصورة من كل الإشعارات التي تستخدمها.' : 'ستعود إشعارات هذا الفرع لاستخدام الصورة العامة.', confirmText: 'حذف', tone: 'danger' }))) return;
              const r = await exec(() => removeNoticeImage(scope, kind), { success: 'تم الحذف', refresh: false }); if (r?.ok) onChanged(false);
            }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line p-3.5">
      <div className="flex-1">
        <p className="text-[14px] font-medium">{label}</p>
        {hint && <p className="text-[12.5px] leading-5 text-ink-muted">{hint}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

const tri = (v: boolean | null) => (v === null ? 'inherit' : v ? 'on' : 'off');
const untri = (s: string) => (s === 'inherit' ? null : s === 'on');

export function NoticeSettingsClient({ missing, initial, school, year, branches, branchData, subjects, grades, sections, teachers, levels }: {
  missing: boolean; initial: NoticeSettings; school: string; year: string;
  branches: { id: string; name: string }[]; branchData: Record<string, NoticeBranch>;
  subjects: { id: string; name: string; name_en: string | null }[]; grades: { id: string; name: string; name_en: string | null }[];
  sections: SectionRow[]; teachers: TeacherRow[]; levels: string[];
}) {
  const [tab, setTab] = useState<Tab>('general');
  const [v, setV] = useState(initial);
  const [bid, setBid] = useState(branches[0]?.id ?? '');
  const [bd, setBd] = useState<Record<string, NoticeBranch>>(branchData);
  const [brands, setBrands] = useState<Record<string, NoticeBrand>>({});
  const [ver, setVer] = useState(0);
  const [ownMap, setOwnMap] = useState<Record<string, Partial<Record<'logo' | 'signature' | 'stamp', boolean>>>>(
    Object.fromEntries(Object.entries(branchData).map(([id, b]) => [id, { logo: !!b.images.logo, signature: !!b.images.signature, stamp: !!b.images.stamp }])),
  );
  const own = ownMap;
  const setOwn = (k: 'logo' | 'signature' | 'stamp', has: boolean) => { setOwnMap((m) => ({ ...m, [bid]: { ...m[bid], [k]: has } })); setVer((x) => x + 1); };
  const [full, setFull] = useState(false);
  const [en, setEn] = useState({
    subjects: Object.fromEntries(subjects.map((s) => [s.id, s.name_en ?? ''])),
    grades: Object.fromEntries(grades.map((g) => [g.id, g.name_en ?? ''])),
  });
  const [home, setHome] = useState<Record<string, string | null>>(Object.fromEntries(sections.map((s) => [s.id, s.teacher_id])));
  const { exec, busy } = useAction();
  const confirm = useConfirm();

  const scopeBranch = tab === 'branches' ? bid : null;
  const branch = (bid && bd[bid]) || BRANCH_DEFAULTS;
  const setBranch = (patch: Partial<NoticeBranch>) => setBd((m) => ({ ...m, [bid]: { ...(m[bid] ?? BRANCH_DEFAULTS), ...patch } }));
  const set = <K extends keyof NoticeSettings>(k: K, val: NoticeSettings[K]) => setV((s) => ({ ...s, [k]: val }));

  // صور المعاينة (عامة، أو مدموجة مع صور الفرع)
  const key = scopeBranch ?? 'global';
  useEffect(() => {
    let live = true;
    loadNoticeAssets(scopeBranch).then((r) => { if (live && r.ok && r.data) setBrands((m) => ({ ...m, [key]: r.data! })); });
    return () => { live = false; };
  }, [key, scopeBranch, ver]);

  const brandNow = useMemo(() => brands[key] ?? {}, [brands, key]);
  const bName = branches.find((b) => b.id === bid)?.name ?? 'فرع النموذج';
  const data = useMemo(() => demo(school, year, tab === 'branches' ? bName : (branches[0]?.name ?? 'فرع النموذج')), [school, year, tab, bName, branches]);
  const render = useMemo(() => resolveRender(v, tab === 'branches' ? branch : BRANCH_DEFAULTS, brandNow), [v, tab, branch, brandNow]);

  if (missing) {
    return (
      <div className="card flex items-start gap-3 p-5">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
        <div>
          <p className="text-[15px] font-semibold">يلزم تشغيل ملف التحديث 0012 أولاً</p>
          <p className="mt-1 text-[13.5px] leading-6 text-ink-muted">افتحي Supabase ← SQL Editor، والصقي محتوى الملف <span dir="ltr">supabase/migrations/0012_grade_notices.sql</span> وشغّليه مرة واحدة، ثم حدّثي هذه الصفحة.</p>
        </div>
      </div>
    );
  }

  const saveGeneral = async () => {
    if (initial.enabled && !v.enabled && !(await confirm({
      title: 'إيقاف إصدار الإشعارات',
      message: 'ستتوقف المشرفات والمربيات عن إصدار الإشعارات فوراً (يبقى الأدمن قادراً على الإصدار).',
      confirmText: 'إيقاف وحفظ', tone: 'danger',
    }))) return;
    return exec(() => saveNoticeSettings({
    enabled: v.enabled, allow_supervisor: v.allow_supervisor, allow_homeroom: v.allow_homeroom,
    header_ar: v.header_ar, header_en: v.header_en, show_basmala: v.show_basmala, school_en: v.school_en, year_hijri: v.year_hijri, year_greg: v.year_greg,
    title_ar: v.title_ar, title_en: v.title_en, show_signature: v.show_signature, show_stamp: v.show_stamp,
    show_disclaimer: v.show_disclaimer, show_footer: v.show_footer, show_levels_legend: v.show_levels_legend, level_en: v.level_en, bands: v.bands,
    }), { success: 'تم حفظ الإعدادات' });
  };

  const saveBranch = () => exec(() => saveNoticeBranch(bid, {
    name_en: branch.name_en, principal_gender: branch.principal_gender, principal_title: branch.principal_title,
    principal_title_en: branch.principal_title_en, principal_name: branch.principal_name, principal_name_en: branch.principal_name_en,
    show_signature: branch.show_signature, show_stamp: branch.show_stamp,
  }), { success: `تم حفظ إعدادات ${bName}` });

  const Preview = (
    <div className="lg:sticky lg:top-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-medium text-ink-soft">معاينة حية (بيانات تجريبية)</p>
        <Button size="sm" variant="ghost" onClick={() => setFull(true)}><Eye className="h-4 w-4" />تكبير</Button>
      </div>
      <NoticePreview data={data} render={render} />
    </div>
  );

  const showPreview = tab === 'general' || tab === 'branches';

  return (
    <>
      <div className="mb-4 flex gap-1.5 overflow-x-auto rounded-full bg-white p-1 shadow-soft ring-1 ring-line">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={cn('shrink-0 rounded-full px-4 py-2 text-[13.5px] transition', tab === t.key ? 'bg-black font-medium text-white' : 'text-ink-muted hover:text-ink')}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={cn('grid gap-5', showPreview && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]')}>
        <div className="min-w-0 space-y-4">
          {/* ------------------------------------------------ عام */}
          {tab === 'general' && (
            <>
              <div className="card space-y-4 p-5 sm:p-6">
                <h3 className="text-[15px] font-semibold">الترويسة</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="السطر العربي (يمين)"><Input value={v.header_ar} onChange={(e) => set('header_ar', e.target.value)} /></Field>
                  <Field label="السطر الإنجليزي (يسار)"><Input dir="ltr" className="text-right" value={v.header_en} onChange={(e) => set('header_en', e.target.value)} /></Field>
                  <Field label="اسم المدرسة بالإنجليزي" hint="يظهر بجانب اسم المدرسة بالعربي"><Input dir="ltr" className="text-right" value={v.school_en} onChange={(e) => set('school_en', e.target.value)} /></Field>
                  <Field label="العام الدراسي الهجري" hint={`يظهر في الإشعار. اتركيه فارغاً لاستخدام عام النظام (${year}). مثال: 1447هـ`}><Input value={v.year_hijri} onChange={(e) => set('year_hijri', e.target.value)} placeholder={year} /></Field>
                  <Field label="العام الدراسي الميلادي" hint="مثال: 2025/2026"><Input dir="ltr" className="text-right" value={v.year_greg} onChange={(e) => set('year_greg', e.target.value)} /></Field>
                </div>
                <Toggle label="البسملة" hint="تظهر أعلى الإشعار، ويمكن رفعها صورة" checked={v.show_basmala} onChange={(x) => set('show_basmala', x)} />
              </div>

              <div className="card space-y-3 p-5 sm:p-6">
                <h3 className="text-[15px] font-semibold">الشعارات</h3>
                {(['logo', 'vision', 'basmala'] as const).map((k) => (
                  <ImageSlot key={k} kind={k} scope="global" brand={brandNow} owned onChanged={() => setVer((x) => x + 1)} />
                ))}
                <p className="text-[12.5px] text-ink-muted">شعار المدرسة هنا هو الافتراضي لكل الفروع، ويمكنكِ رفع شعار خاص بكل فرع من تبويب «الفروع والمديرات».</p>
              </div>

              <div className="card space-y-4 p-5 sm:p-6">
                <h3 className="text-[15px] font-semibold">عنوان الإشعار</h3>
                <Field label="العنوان العربي" hint="المتغيرات: {الفصل} {الصف} {العام}">
                  <Input value={v.title_ar} onChange={(e) => set('title_ar', e.target.value)} />
                </Field>
                <Field label="العنوان الإنجليزي" hint="المتغيرات: {term} {grade} {year} — يظهر إذا كان للصف اسم إنجليزي">
                  <Input dir="ltr" className="text-right" value={v.title_en} onChange={(e) => set('title_en', e.target.value)} />
                </Field>
              </div>

              <div className="card space-y-3 p-5 sm:p-6">
                <h3 className="text-[15px] font-semibold">التوقيع والختم</h3>
                <Toggle label="إظهار التوقيع" hint="يمكن تخصيصه لكل فرع" checked={v.show_signature} onChange={(x) => set('show_signature', x)} />
                <ImageSlot kind="signature" scope="global" brand={brandNow} owned onChanged={() => setVer((x) => x + 1)} />
                <Toggle label="إظهار الختم" hint="يمكن تخصيصه لكل فرع" checked={v.show_stamp} onChange={(x) => set('show_stamp', x)} />
                <ImageSlot kind="stamp" scope="global" brand={brandNow} owned onChanged={() => setVer((x) => x + 1)} />
              </div>

              <div className="card space-y-3 p-5 sm:p-6">
                <h3 className="text-[15px] font-semibold">أسفل الإشعار</h3>
                <Toggle label="شريط «ليس شهادة نهائية»" hint="يوضح أنه إشعار فصل وليس شهادة" checked={v.show_disclaimer} onChange={(x) => set('show_disclaimer', x)} />
                <Toggle label="عبارة «صادر إلكترونياً من منصة مِرقاة»" checked={v.show_footer} onChange={(x) => set('show_footer', x)} />
                <Toggle label="شرح مستويات الطالب (للتقييم اللفظي)" hint="متفوق / متقدم / متمكن / غير مجتاز، بالعربي والإنجليزي أسفل الجدول" checked={v.show_levels_legend} onChange={(x) => set('show_levels_legend', x)} />
              </div>
              <Button size="lg" onClick={saveGeneral} loading={busy}>حفظ إعدادات الإشعار</Button>
            </>
          )}

          {/* ------------------------------------------------ الفروع */}
          {tab === 'branches' && (
            <>
              <div className="card p-5 sm:p-6">
                <Field label="الفرع">
                  <Select value={bid} onChange={(e) => setBid(e.target.value)}>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </Field>
              </div>
              {bid && (
                <>
                  <div className="card space-y-4 p-5 sm:p-6">
                    <h3 className="text-[15px] font-semibold">مديرة الفرع</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="الاسم بالعربي"><Input value={branch.principal_name} onChange={(e) => setBranch({ principal_name: e.target.value })} /></Field>
                      <Field label="الاسم بالإنجليزي"><Input dir="ltr" className="text-right" value={branch.principal_name_en} onChange={(e) => setBranch({ principal_name_en: e.target.value })} /></Field>
                      <Field label="الصفة">
                        <Select value={branch.principal_gender} onChange={(e) => setBranch({ principal_gender: e.target.value as 'm' | 'f' })}>
                          <option value="f">مديرة</option><option value="m">مدير</option>
                        </Select>
                      </Field>
                      <Field label="اسم الفرع بالإنجليزي"><Input dir="ltr" className="text-right" value={branch.name_en} onChange={(e) => setBranch({ name_en: e.target.value })} /></Field>
                      <Field label="المسمى بالعربي" hint="اتركيه فارغاً لاستخدام «مديرة الفرع / مدير الفرع»"><Input value={branch.principal_title} onChange={(e) => setBranch({ principal_title: e.target.value })} placeholder={branch.principal_gender === 'f' ? 'مديرة الفرع' : 'مدير الفرع'} /></Field>
                      <Field label="المسمى بالإنجليزي"><Input dir="ltr" className="text-right" value={branch.principal_title_en} onChange={(e) => setBranch({ principal_title_en: e.target.value })} placeholder="Branch Principal" /></Field>
                    </div>
                  </div>
                  <div className="card space-y-3 p-5 sm:p-6">
                    <h3 className="text-[15px] font-semibold">شعار وتوقيع وختم الفرع</h3>
                    <ImageSlot kind="logo" scope={bid} brand={brandNow} owned={!!own[bid]?.logo} onChanged={(h) => setOwn('logo', h)} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="التوقيع">
                        <Select value={tri(branch.show_signature)} onChange={(e) => setBranch({ show_signature: untri(e.target.value) })}>
                          <option value="inherit">حسب الإعداد العام ({v.show_signature ? 'يظهر' : 'لا يظهر'})</option><option value="on">يظهر</option><option value="off">لا يظهر</option>
                        </Select>
                      </Field>
                      <Field label="الختم">
                        <Select value={tri(branch.show_stamp)} onChange={(e) => setBranch({ show_stamp: untri(e.target.value) })}>
                          <option value="inherit">حسب الإعداد العام ({v.show_stamp ? 'يظهر' : 'لا يظهر'})</option><option value="on">يظهر</option><option value="off">لا يظهر</option>
                        </Select>
                      </Field>
                    </div>
                    <ImageSlot kind="signature" scope={bid} brand={brandNow} owned={!!own[bid]?.signature} onChanged={(h) => setOwn('signature', h)} />
                    <ImageSlot kind="stamp" scope={bid} brand={brandNow} owned={!!own[bid]?.stamp} onChanged={(h) => setOwn('stamp', h)} />
                  </div>
                  <Button size="lg" onClick={saveBranch} loading={busy}>حفظ إعدادات {bName}</Button>
                </>
              )}
            </>
          )}

          {/* ------------------------------------------------ مربيات الفصول */}
          {tab === 'homeroom' && (
            <>
              <div className="card p-5 sm:p-6">
                <Field label="الفرع" hint="تُسند مربية الفصل لكل شعبة. مربية الفصل تصدر إشعارات شعبتها فقط (إن سمحتِ بذلك من «الإصدار والصلاحيات»)">
                  <Select value={bid} onChange={(e) => setBid(e.target.value)}>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="card divide-y divide-line">
                {sections.filter((s) => s.branch_id === bid).sort((a, b) => a.sort - b.sort).map((s) => (
                  <div key={s.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4">
                    <p className="flex-1 text-[14.5px] font-medium">{s.grade} <span className="text-ink-muted">· {secLabel(s.name)}</span></p>
                    <div className="sm:w-72">
                      <Select value={home[s.id] ?? ''} disabled={busy}
                        onChange={async (e) => {
                          const val = e.target.value || null;
                          const prevName = home[s.id] ? teachers.find((t) => t.id === home[s.id])?.full_name : null;
                          if (prevName && !(await confirm({
                            title: val ? 'تغيير مربية الفصل' : 'إلغاء إسناد مربية الفصل',
                            message: <>ستفقد <b>{prevName}</b> صلاحية إصدار إشعارات {s.grade} · {secLabel(s.name)}{val ? ' وتنتقل الصلاحية للمربية الجديدة' : ''}.</>,
                            confirmText: val ? 'تغيير' : 'إلغاء الإسناد', tone: 'danger',
                          }))) return;
                          const r = await exec(() => setClassTeacher(s.id, val), { success: val ? 'تم إسناد مربية الفصل' : 'تم إلغاء الإسناد', refresh: false });
                          if (r?.ok) setHome((m) => ({ ...m, [s.id]: val }));
                        }}>
                        <option value="">— بدون مربية —</option>
                        {teachers.filter((t) => t.branch_id === bid).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                      </Select>
                    </div>
                  </div>
                ))}
                {!sections.some((s) => s.branch_id === bid) && <p className="p-6 text-center text-[13.5px] text-ink-muted">لا توجد شعب في هذا الفرع</p>}
              </div>
            </>
          )}

          {/* ------------------------------------------------ الأسماء الإنجليزية */}
          {tab === 'english' && (
            <>
              <div className="card space-y-3 p-5 sm:p-6">
                <h3 className="text-[15px] font-semibold">أسماء الصفوف</h3>
                <p className="text-[12.5px] text-ink-muted">يظهر عنوان الإشعار الإنجليزي للصف الذي له اسم إنجليزي فقط.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {grades.map((g) => (
                    <Field key={g.id} label={g.name}><Input dir="ltr" className="text-right" value={en.grades[g.id] ?? ''} onChange={(e) => setEn((x) => ({ ...x, grades: { ...x.grades, [g.id]: e.target.value } }))} placeholder="Grade 1" /></Field>
                  ))}
                </div>
              </div>
              <div className="card space-y-3 p-5 sm:p-6">
                <h3 className="text-[15px] font-semibold">أسماء المواد</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {subjects.map((s) => (
                    <Field key={s.id} label={s.name}><Input dir="ltr" className="text-right" value={en.subjects[s.id] ?? ''} onChange={(e) => setEn((x) => ({ ...x, subjects: { ...x.subjects, [s.id]: e.target.value } }))} placeholder="Mathematics" /></Field>
                  ))}
                </div>
              </div>
              {levels.length > 0 && (
                <div className="card space-y-3 p-5 sm:p-6">
                  <h3 className="text-[15px] font-semibold">مستويات التقييم اللفظي</h3>
                  <p className="text-[12.5px] text-ink-muted">تظهر في عمود الترجمة. المستويات الشائعة (متفوق، متقدم، متمكن، غير مجتاز…) مترجمة تلقائياً، واكتبي هنا لتغيير ترجمة أي مستوى.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {levels.map((l) => (
                      <Field key={l} label={l}><Input dir="ltr" className="text-right" value={v.level_en[l] ?? ''} onChange={(e) => set('level_en', { ...v.level_en, [l]: e.target.value })} placeholder={levelEn(l, { ...v, level_en: {} }) || 'Level'} /></Field>
                    ))}
                  </div>
                </div>
              )}
              <Button size="lg" loading={busy} onClick={() => exec<unknown>(async () => { const a = await saveNoticeSettings({
                enabled: v.enabled, allow_supervisor: v.allow_supervisor, allow_homeroom: v.allow_homeroom,
                header_ar: v.header_ar, header_en: v.header_en, show_basmala: v.show_basmala, school_en: v.school_en, year_hijri: v.year_hijri, year_greg: v.year_greg,
                title_ar: v.title_ar, title_en: v.title_en, show_signature: v.show_signature, show_stamp: v.show_stamp,
                show_disclaimer: v.show_disclaimer, show_footer: v.show_footer, show_levels_legend: v.show_levels_legend, level_en: v.level_en, bands: v.bands,
              }); return a.ok ? saveEnglishNames({
                subjects: subjects.map((s) => ({ id: s.id, name_en: en.subjects[s.id] ?? '' })),
                grades: grades.map((g) => ({ id: g.id, name_en: en.grades[g.id] ?? '' })),
              }) : a; }, { success: 'تم حفظ الأسماء الإنجليزية' })}>حفظ الأسماء</Button>
            </>
          )}

          {/* ------------------------------------------------ الصلاحيات */}
          {tab === 'access' && (
            <>
              <div className="card space-y-3 p-5 sm:p-6">
                <h3 className="text-[15px] font-semibold">من يصدر الإشعارات؟</h3>
                <p className="text-[12.5px] leading-5 text-ink-muted">الأدمن يصدر دائماً. غيره لا يستطيع شيئاً إلا بعد تفعيل الإصدار هنا، ثم السماح لدوره.</p>
                <Toggle label="تفعيل الإصدار" hint="مفتاح رئيسي: عند إغلاقه لا يصدر إلا الأدمن" checked={v.enabled} onChange={(x) => set('enabled', x)} />
                <Toggle label="السماح للمشرفة" hint="تصدر لأي طالب في فرعها" checked={v.allow_supervisor} onChange={(x) => set('allow_supervisor', x)} />
                <Toggle label="السماح لمربية الفصل" hint="تصدر لطلاب شعبتها فقط، لطالب واحد في كل مرة" checked={v.allow_homeroom} onChange={(x) => set('allow_homeroom', x)} />
                <p className="rounded-xl bg-surface p-3 text-[12.5px] leading-6 text-ink-muted">لا يصدر الإشعار لغير الأدمن قبل اكتمال رصد كل مواد الطالب في الفصل. وإن كان ناقصاً تظهر لهم المادة الناقصة واسم معلمتها فقط. الأدمن يستطيع إصداره ناقصاً مع تنبيه.</p>
              </div>
              <div className="card space-y-4 p-5 sm:p-6">
                <h3 className="text-[15px] font-semibold">حدود التقدير (٪)</h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {([['excellent', 'ممتاز من'], ['vgood', 'جيد جداً من'], ['good', 'جيد من'], ['pass', 'مقبول من']] as const).map(([k, l]) => (
                    <Field key={k} label={l}><Input type="number" min={1} max={100} value={v.bands[k]} onChange={(e) => set('bands', { ...v.bands, [k]: Number(e.target.value) })} /></Field>
                  ))}
                </div>
                <p className="text-[12.5px] text-ink-muted">ما دون «مقبول» يُعدّ «ضعيف».</p>
              </div>
              <Button size="lg" onClick={saveGeneral} loading={busy}><Check className="h-4 w-4" />حفظ الصلاحيات</Button>
            </>
          )}
        </div>
        {showPreview && <div className="min-w-0">{Preview}</div>}
      </div>

      <Dialog open={full} onClose={() => setFull(false)} title="معاينة الإشعار" description="بيانات تجريبية لمراجعة التصميم فقط" size="xl">
        <NoticePreview data={data} render={render} />
      </Dialog>
    </>
  );
}
