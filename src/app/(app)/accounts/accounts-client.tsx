'use client';
import { useMemo, useState } from 'react';
import { Plus, Search, KeyRound, Pencil, UserX, UserCheck, Trash2, Users, Copy, Download, AtSign, ListPlus, MoreVertical, Check } from 'lucide-react';
import {
  createAccount, bulkCreateTeachers, resetPassword, changeUsername, updateAccount,
  setAccountActive, deleteAccount, exportCredentials, type Credential,
} from '@/app/actions/accounts';
import { useAction } from '@/lib/use-action';
import { downloadBase64 } from '@/lib/download';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { Avatar } from '@/components/shell/shell';
import { FloatingMenu, MenuItem } from '@/components/ui/menu';
import { PasswordChoice, type PasswordMode } from '@/components/ui/password-choice';
import { ROLE_LABEL, type Branch, type Profile, type Role } from '@/lib/types';
import { cn, fmtDateTime } from '@/lib/utils';

type Edit = { id?: string; full_name: string; phone: string; role: Role; branch_id: string | null; username?: string };

export function AccountsClient({ me, accounts, branches, assignCount }: {
  me: Profile; accounts: Profile[]; branches: Branch[]; assignCount: Record<string, number>;
}) {
  const isAdmin = me.role === 'admin';
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [branch, setBranch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive' | 'never'>('all');
  const [edit, setEdit] = useState<Edit | null>(null);
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkBranch, setBulkBranch] = useState(me.branch_id ?? branches[0]?.id ?? '');
  const [creds, setCreds] = useState<{ list: Credential[]; failed?: { line: string; reason: string }[] } | null>(null);
  const [userFor, setUserFor] = useState<Profile | null>(null);
  const [newUser, setNewUser] = useState('');
  const [menu, setMenu] = useState<{ id: string; el: HTMLElement } | null>(null);
  const [pwMode, setPwMode] = useState<PasswordMode>('auto');
  const [pw, setPw] = useState('');
  const [resetFor, setResetFor] = useState<Profile | null>(null);
  const { exec, busy } = useAction();
  const toast = useToast();
  const menuAcc = menu ? accounts.find((x) => x.id === menu.id) ?? null : null;
  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return accounts.filter((a) =>
      (!s || a.full_name.toLowerCase().includes(s) || a.username.includes(s) || (a.phone ?? '').includes(s))
      && (!role || a.role === role) && (!branch || a.branch_id === branch)
      && (status === 'all' || (status === 'active' && a.is_active) || (status === 'inactive' && !a.is_active) || (status === 'never' && !a.last_login_at)));
  }, [accounts, q, role, branch, status]);

  const save = async () => {
    if (!edit) return;
    if (edit.id) {
      const r = await exec(() => updateAccount(edit.id!, edit), { success: 'تم حفظ التعديلات' });
      if (r?.ok) setEdit(null);
    } else {
      if (pwMode === 'manual' && pw.length < 6) { toast.error('اكتبي كلمة مرور من 6 أحرف أو أرقام على الأقل'); return; }
      const r = await exec(() => createAccount({ ...edit, username: edit.username || undefined, password: pwMode === 'manual' ? pw : undefined }), { success: 'تم إنشاء الحساب' });
      if (r?.ok && r.data) { setEdit(null); setCreds({ list: [r.data] }); }
    }
  };

  const doReset = (a: Profile) => { setMenu(null); setPwMode('auto'); setPw(''); setResetFor(a); };
  const confirmReset = async () => {
    if (!resetFor) return;
    if (pwMode === 'manual' && pw.length < 6) { toast.error('اكتبي كلمة مرور من 6 أحرف أو أرقام على الأقل'); return; }
    const r = await exec(() => resetPassword(resetFor.id, pwMode === 'manual' ? pw : undefined), { refresh: false });
    if (r?.ok && r.data) { setResetFor(null); setCreds({ list: [r.data] }); }
  };

  const doExport = async () => {
    if (!creds) return;
    const r = await exec(() => exportCredentials(creds.list, me.branch_id ? branchName.get(me.branch_id) : undefined), { refresh: false });
    if (r?.ok && r.data) downloadBase64(r.data, `بيانات-الدخول-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const copy = (c: Credential) => {
    void navigator.clipboard.writeText(`${c.full_name}\nاسم المستخدم: ${c.username}\nكلمة المرور: ${c.password}`);
    toast.success('تم النسخ');
  };

  return (
    <>
      <div className="card mb-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحثي بالاسم أو اسم المستخدم أو الجوال" className="pr-10" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            {isAdmin && (
              <Select value={role} onChange={(e) => setRole(e.target.value as Role | '')} className="sm:w-36">
                <option value="">كل الصلاحيات</option>
                <option value="teacher">معلمات</option>
                <option value="supervisor">مشرفات</option>
                <option value="admin">أدمن</option>
              </Select>
            )}
            {isAdmin && (
              <Select value={branch} onChange={(e) => setBranch(e.target.value)} className="sm:w-40">
                <option value="">كل الفروع</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            )}
            <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="sm:w-40">
              <option value="all">كل الحالات</option>
              <option value="active">نشط</option>
              <option value="inactive">موقوف</option>
              <option value="never">لم يسجّل دخول</option>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setBulk(true); setBulkText(''); }}><ListPlus className="h-4 w-4" />معلمات دفعة</Button>
            <Button onClick={() => { setPwMode('auto'); setPw(''); setEdit({ full_name: '', phone: '', role: 'teacher', branch_id: me.branch_id ?? branches[0]?.id ?? null }); }}>
              <Plus className="h-4 w-4" />حساب جديد
            </Button>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">النتائج <span className="num text-ink-muted">({list.length})</span></h2>
        </div>
        {list.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="لا توجد حسابات مطابقة" hint="غيّري البحث أو أضيفي حساباً جديداً." />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((a) => (
              <li key={a.id} className={cn('relative flex items-center gap-3 px-4 py-3 sm:px-5', !a.is_active && 'bg-surface/60')}>
                <Avatar name={a.full_name} className={cn(!a.is_active && 'opacity-50')} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{a.full_name}</p>
                  <p className="truncate text-[12.5px] text-ink-muted">
                    <span dir="ltr">{a.username}</span>
                    {a.branch_id && isAdmin ? ` · ${branchName.get(a.branch_id)}` : ''}
                  </p>
                </div>
                <div className="hidden w-28 md:block">
                  {a.role === 'teacher'
                    ? <span className="text-[12.5px] text-ink-soft">{assignCount[a.id] ?? 0} إسناد</span>
                    : <Badge tone={a.role === 'admin' ? 'info' : 'neutral'}>{ROLE_LABEL[a.role]}</Badge>}
                </div>
                <div className="hidden w-40 text-[12.5px] text-ink-muted lg:block">
                  {a.last_login_at ? fmtDateTime(a.last_login_at) : <span className="text-amber">لم يسجّل دخول</span>}
                </div>
                {!a.is_active && <Badge tone="danger">موقوف</Badge>}
                <button onClick={(e) => { const el = e.currentTarget; setMenu((m) => (m?.id === a.id ? null : { id: a.id, el })); }}
                  className={cn('rounded-full p-2 text-ink-muted transition hover:bg-surface hover:text-ink', menu?.id === a.id && 'bg-surface text-ink')}
                  aria-label="خيارات" aria-haspopup="menu" aria-expanded={menu?.id === a.id}>
                  <MoreVertical className="h-[18px] w-[18px]" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>


      <FloatingMenu anchor={menu?.el ?? null} onClose={() => setMenu(null)}>
        {menuAcc && (() => { const a = menuAcc; return (
          <>
            <MenuItem icon={<KeyRound />} onClick={() => doReset(a)}>إعادة تعيين كلمة المرور</MenuItem>
            <MenuItem icon={<AtSign />} onClick={() => { setMenu(null); setUserFor(a); setNewUser(a.username); }}>تغيير اسم المستخدم</MenuItem>
            <MenuItem icon={<Pencil />} onClick={() => { setMenu(null); setEdit({ id: a.id, full_name: a.full_name, phone: a.phone ?? '', role: a.role, branch_id: a.branch_id }); }}>تعديل البيانات</MenuItem>
            {a.id !== me.id && (
              <MenuItem icon={a.is_active ? <UserX /> : <UserCheck />} tone={a.is_active ? 'danger' : undefined}
                onClick={() => { setMenu(null); void exec(() => setAccountActive(a.id, !a.is_active), {
                  success: a.is_active ? 'تم إيقاف الحساب' : 'تم تفعيل الحساب',
                  confirm: { title: a.is_active ? 'إيقاف الحساب' : 'تفعيل الحساب', tone: a.is_active ? 'danger' : 'success',
                    message: a.is_active ? `لن تستطيع ${a.full_name} الدخول حتى يُعاد تفعيل الحساب.` : `ستستطيع ${a.full_name} الدخول مرة أخرى.`,
                    confirmText: a.is_active ? 'إيقاف' : 'تفعيل' },
                }); }}>
                {a.is_active ? 'إيقاف الحساب' : 'تفعيل الحساب'}
              </MenuItem>
            )}
            {isAdmin && a.id !== me.id && (
              <MenuItem icon={<Trash2 />} tone="danger" onClick={() => { setMenu(null); void exec(() => deleteAccount(a.id), {
                success: 'تم حذف الحساب',
                confirm: { title: 'حذف الحساب نهائياً', tone: 'danger', confirmText: 'حذف نهائي',
                  message: `سيتم حذف حساب ${a.full_name} وإسناداته. الدرجات المرصودة تبقى محفوظة. يُفضّل «إيقاف الحساب» بدلاً من الحذف.` },
              }); }}>حذف نهائي</MenuItem>
            )}
          </>
        ); })()}
      </FloatingMenu>

      {/* إنشاء / تعديل */}
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'تعديل الحساب' : 'حساب جديد'}
        description={!edit?.id ? 'سيتم توليد اسم المستخدم وكلمة المرور تلقائياً' : undefined}
        footer={<>
          <Button loading={busy} onClick={save}>{edit?.id ? 'حفظ' : 'إنشاء الحساب'}</Button>
          <Button variant="secondary" onClick={() => setEdit(null)}>إلغاء</Button>
        </>}>
        {edit && (
          <div className="space-y-4">
            <Field label="الاسم الكامل"><Input value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} placeholder="الاسم ثلاثياً" /></Field>
            <Field label="رقم الجوال (اختياري)"><Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} dir="ltr" className="text-right" inputMode="tel" /></Field>
            {isAdmin && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="الصلاحية">
                  <Select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}>
                    <option value="teacher">معلمة</option>
                    <option value="supervisor">مشرفة</option>
                    <option value="admin">أدمن</option>
                  </Select>
                </Field>
                {edit.role !== 'admin' && (
                  <Field label="الفرع">
                    <Select value={edit.branch_id ?? ''} onChange={(e) => setEdit({ ...edit, branch_id: e.target.value || null })}>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </Field>
                )}
              </div>
            )}
            {!edit.id && (
              <Field label="اسم المستخدم (اختياري)" hint="اتركيه فارغاً للتوليد التلقائي. أحرف إنجليزية صغيرة وأرقام فقط">
                <Input value={edit.username ?? ''} onChange={(e) => setEdit({ ...edit, username: e.target.value.toLowerCase() })} dir="ltr" className="text-right" autoCapitalize="none" />
              </Field>
            )}
            {!edit.id && (
              <PasswordChoice mode={pwMode} onMode={setPwMode} value={pw} onChange={setPw} />
            )}
            {edit.id && edit.branch_id !== accounts.find((a) => a.id === edit.id)?.branch_id && (
              <p className="rounded-xl bg-amber-soft p-3 text-[13px] text-amber">نقل المعلمة لفرع آخر يحذف إسناداتها الحالية.</p>
            )}
          </div>
        )}
      </Dialog>

      {/* دفعة */}
      <Dialog open={bulk} onClose={() => setBulk(false)} size="lg" title="إضافة معلمات دفعة واحدة"
        description="الصقي الأسماء، اسم في كل سطر. يمكنك إضافة الجوال بعد فاصلة."
        footer={<>
          <Button loading={busy} onClick={async () => {
            const n = bulkText.split('\n').filter((l) => l.trim()).length;
            const r = await exec(() => bulkCreateTeachers(bulkBranch, bulkText), {
              confirm: { title: 'إنشاء الحسابات', message: `سيتم إنشاء ${n} حساب معلمة${isAdmin ? ` في ${branchName.get(bulkBranch)}` : ''}.`, confirmText: 'إنشاء' },
              success: (d) => `تم إنشاء ${d?.created.length ?? 0} حساب`,
            });
            if (r?.ok && r.data) { setBulk(false); setCreds({ list: r.data.created, failed: r.data.failed }); }
          }}>إنشاء الحسابات</Button>
          <Button variant="secondary" onClick={() => setBulk(false)}>إلغاء</Button>
        </>}>
        <div className="space-y-4">
          {isAdmin && (
            <Field label="الفرع">
              <Select value={bulkBranch} onChange={(e) => setBulkBranch(e.target.value)}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
          )}
          <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={10}
            placeholder={'نورة عبدالله السالم، 0500000000\nسارة محمد القحطاني'}
            className="field h-auto py-3 leading-7" />
          <p className="num text-[12.5px] text-ink-muted">{bulkText.split('\n').filter((l) => l.trim()).length} اسم</p>
        </div>
      </Dialog>

      {/* إعادة تعيين كلمة المرور */}
      <Dialog open={!!resetFor} onClose={() => setResetFor(null)} title="إعادة تعيين كلمة المرور"
        description={<>{resetFor?.full_name} · <span dir="ltr">{resetFor?.username}</span> — كلمة المرور القديمة لن تعمل بعد الحفظ.</>}
        footer={<>
          <Button loading={busy} onClick={confirmReset}><KeyRound className="h-4 w-4" />حفظ كلمة المرور</Button>
          <Button variant="secondary" onClick={() => setResetFor(null)}>إلغاء</Button>
        </>}>
        <div className="pb-2"><PasswordChoice mode={pwMode} onMode={setPwMode} value={pw} onChange={setPw} /></div>
      </Dialog>

      {/* بيانات الدخول */}
      <Dialog open={!!creds} onClose={() => setCreds(null)} size="lg" title="بيانات الدخول"
        description="احفظيها الآن — كلمات المرور لا تظهر مرة أخرى"
        footer={<>
          <Button onClick={doExport} loading={busy}><Download className="h-4 w-4" />تحميل إكسل</Button>
          <Button variant="secondary" onClick={() => setCreds(null)}>تم</Button>
        </>}>
        <ul className="space-y-2">
          {creds?.list.map((c) => (
            <li key={c.username} className="flex items-center gap-3 rounded-2xl bg-surface p-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{c.full_name}</p>
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                  <span>المستخدم: <b dir="ltr" className="font-mono">{c.username}</b></span>
                  <span>المرور: <b dir="ltr" className="font-mono">{c.password}</b></span>
                </p>
              </div>
              <button onClick={() => copy(c)} className="rounded-full p-2 text-ink-muted hover:bg-white hover:text-ink" aria-label="نسخ"><Copy className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
        {!!creds?.failed?.length && (
          <div className="mt-4 rounded-2xl bg-rose-soft p-4">
            <p className="mb-2 text-[13.5px] font-medium text-rose">لم يتم إنشاء {creds.failed.length}:</p>
            <ul className="space-y-1 text-[13px] text-rose">
              {creds.failed.map((f, i) => <li key={i}>{f.line} — {f.reason}</li>)}
            </ul>
          </div>
        )}
      </Dialog>

      {/* اسم المستخدم */}
      <Dialog open={!!userFor} onClose={() => setUserFor(null)} title="تغيير اسم المستخدم" description={userFor?.full_name}
        footer={<>
          <Button loading={busy} onClick={async () => {
            const r = await exec(() => changeUsername(userFor!.id, newUser), {
              success: 'تم تغيير اسم المستخدم',
              confirm: { title: 'تأكيد التغيير', message: <>اسم الدخول الجديد: <b dir="ltr">{newUser}</b><br />القديم لن يعمل بعد الآن.</>, confirmText: 'تغيير' },
            });
            if (r?.ok) setUserFor(null);
          }}><Check className="h-4 w-4" />حفظ</Button>
          <Button variant="secondary" onClick={() => setUserFor(null)}>إلغاء</Button>
        </>}>
        <Input value={newUser} onChange={(e) => setNewUser(e.target.value.toLowerCase())} dir="ltr" className="text-right" autoCapitalize="none" />
        <p className="mt-2 text-[12.5px] text-ink-muted">أحرف إنجليزية صغيرة وأرقام و . _ - فقط</p>
      </Dialog>
    </>
  );
}

