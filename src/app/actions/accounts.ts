'use server';
import { z } from 'zod';
import { run, must, ActionError, parseOr } from '@/lib/action';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/audit';
import { usernameToEmail } from '@/lib/auth';
import { generatePassword } from '@/lib/utils';
import { newBook, newSheet, styleHeaderRow, styleBodyRow, titleBlock, toBase64 } from '@/lib/excel';
import { ROLE_LABEL, type Profile, type Role } from '@/lib/types';

const USERNAME = /^[a-z0-9._-]{3,32}$/;
type Target = Pick<Profile, 'id' | 'role' | 'branch_id' | 'full_name' | 'username'>;
export interface Credential { full_name: string; username: string; password: string; role: Role; branch?: string | null }

/** هل يحق للمستخدم الحالي إدارة هذا الحساب؟ */
function assertCanManage(actor: Profile, target: Target) {
  if (actor.role === 'admin') return;
  if (actor.role === 'supervisor' && target.role === 'teacher' && target.branch_id === actor.branch_id) return;
  throw new ActionError('غير مصرّح لك بإدارة هذا الحساب');
}

async function loadTarget(id: string) {
  const { data } = await createAdminClient().from('profiles')
    .select('id, role, branch_id, full_name, username').eq('id', parseOr(z.string().uuid(), id)).single<Target>();
  if (!data) throw new ActionError('الحساب غير موجود');
  return data;
}

async function uniqueUsername(prefix: string) {
  const admin = createAdminClient();
  for (let i = 0; i < 25; i++) {
    const n = Math.floor(1000 + Math.random() * 9000);
    const u = `${prefix}${n}`;
    const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('username', u);
    if (!count) return u;
  }
  throw new ActionError('تعذّر توليد اسم مستخدم، أعيدي المحاولة');
}

async function branchPrefix(branchId: string | null, role: Role) {
  const r = role === 'teacher' ? 't' : role === 'supervisor' ? 's' : 'a';
  if (!branchId) return r;
  const { data } = await createAdminClient().from('branches').select('code').eq('id', branchId).single();
  const code = (data?.code ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return r + code;
}

const WEAK = new Set(['123456', '1234567', '12345678', '123456789', '1234567890', '111111', '000000', '123123', 'password', 'qwerty', 'abc123', '654321', 'password1']);

/** كلمة مرور يكتبها المستخدم: 6 أحرف على الأقل، بدون مسافات، وليست سهلة التخمين */
function checkPassword(pw: string, username: string) {
  if (pw.length < 6) throw new ActionError('كلمة المرور 6 أحرف أو أرقام على الأقل');
  if (pw.length > 72) throw new ActionError('كلمة المرور طويلة جداً');
  if (/\s/.test(pw)) throw new ActionError('كلمة المرور لا تحتوي مسافات');
  if (WEAK.has(pw.toLowerCase()) || /^(.)\1+$/.test(pw)) throw new ActionError('كلمة المرور سهلة التخمين، اختاري غيرها');
  if (pw.toLowerCase() === username.toLowerCase()) throw new ActionError('كلمة المرور لا تكون نفس اسم المستخدم');
  return pw;
}

const createSchema = z.object({
  full_name: z.string().trim().min(5, 'اكتبي الاسم ثلاثياً').max(120),
  username: z.string().trim().toLowerCase().optional(),
  role: z.enum(['admin', 'supervisor', 'teacher']),
  branch_id: z.string().uuid().nullable().optional(),
  phone: z.string().trim().max(20).optional(),
  password: z.string().optional(), // فارغة = تلقائية
});

async function createOne(actor: Profile, input: z.input<typeof createSchema>): Promise<Credential> {
  const v = parseOr(createSchema, input);
  // المشرفة تنشئ معلمات لفرعها فقط
  if (actor.role === 'supervisor') {
    if (v.role !== 'teacher') throw new ActionError('المشرفة تنشئ حسابات المعلمات فقط');
    v.branch_id = actor.branch_id;
  }
  if (v.role !== 'admin' && !v.branch_id) throw new ActionError('حددي الفرع');
  if (v.role === 'admin') v.branch_id = null;

  let username = v.username || '';
  if (username) {
    if (!USERNAME.test(username)) throw new ActionError('اسم المستخدم: أحرف إنجليزية صغيرة وأرقام فقط (3-32)');
    const { count } = await createAdminClient().from('profiles').select('id', { count: 'exact', head: true }).eq('username', username);
    if (count) throw new ActionError(`اسم المستخدم ${username} مستخدم مسبقاً`);
  } else {
    username = await uniqueUsername(await branchPrefix(v.branch_id ?? null, v.role));
  }

  const password = v.password ? checkPassword(v.password, username) : generatePassword(8);
  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: usernameToEmail(username), password, email_confirm: true, user_metadata: { username },
  });
  if (error || !created.user) throw new ActionError('تعذّر إنشاء الحساب: ' + (error?.message ?? ''));

  const { error: pErr } = await admin.from('profiles').insert({
    id: created.user.id, username, full_name: v.full_name.replace(/\s+/g, ' '), role: v.role,
    branch_id: v.branch_id ?? null, phone: v.phone || null, created_by: actor.id,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw pErr;
  }
  await audit({ action: 'account.create', actor, entity: 'profile', entityId: created.user.id, details: { username, role: v.role, name: v.full_name, password: v.password ? 'manual' : 'auto' } });
  return { full_name: v.full_name, username, password, role: v.role };
}

export async function createAccount(input: z.input<typeof createSchema>) {
  return run('account.create', ['admin', 'supervisor'], ({ profile }) => createOne(profile, input), { revalidate: ['/accounts'] });
}

/** إنشاء حسابات معلمات دفعة واحدة: سطر لكل معلمة "الاسم" أو "الاسم، الجوال" */
export async function bulkCreateTeachers(branchId: string | null, text: string) {
  return run('account.bulk_create', ['admin', 'supervisor'], async ({ profile }) => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new ActionError('الصقي أسماء المعلمات، اسم في كل سطر');
    if (lines.length > 300) throw new ActionError('الحد الأقصى 300 اسم في المرة');
    const out: Credential[] = [];
    const failed: { line: string; reason: string }[] = [];
    for (const line of lines) {
      const [name, phone] = line.split(/[,،\t]/).map((x) => x.trim());
      try {
        out.push(await createOne(profile, { full_name: name, phone, role: 'teacher', branch_id: branchId }));
      } catch (e) {
        failed.push({ line: name, reason: e instanceof ActionError ? e.message : 'خطأ غير متوقع' });
      }
    }
    return { created: out, failed };
  }, { revalidate: ['/accounts'] });
}

export async function resetPassword(id: string, manual?: string) {
  return run('account.reset_password', ['admin', 'supervisor'], async ({ profile }) => {
    const t = await loadTarget(id);
    assertCanManage(profile, t);
    const password = manual ? checkPassword(manual, t.username) : generatePassword(8);
    const { error } = await createAdminClient().auth.admin.updateUserById(t.id, { password });
    if (error) throw new ActionError('تعذّر إعادة التعيين');
    await audit({ action: 'account.reset_password', severity: 'warning', actor: profile, entity: 'profile', entityId: t.id, details: { username: t.username, password: manual ? 'manual' : 'auto' } });
    return { full_name: t.full_name, username: t.username, password, role: t.role } as Credential;
  });
}

export async function changeUsername(id: string, username: string) {
  return run('account.change_username', ['admin', 'supervisor'], async ({ profile }) => {
    const t = await loadTarget(id);
    assertCanManage(profile, t);
    const u = username.trim().toLowerCase();
    if (!USERNAME.test(u)) throw new ActionError('اسم المستخدم: أحرف إنجليزية صغيرة وأرقام فقط (3-32)');
    if (u === t.username) return u;
    const admin = createAdminClient();
    const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('username', u);
    if (count) throw new ActionError('اسم المستخدم مستخدم مسبقاً');
    const { error } = await admin.auth.admin.updateUserById(t.id, { email: usernameToEmail(u), email_confirm: true });
    if (error) throw new ActionError('تعذّر تغيير اسم المستخدم');
    must(await admin.from('profiles').update({ username: u }).eq('id', t.id));
    await audit({ action: 'account.change_username', severity: 'warning', actor: profile, entity: 'profile', entityId: t.id, details: { from: t.username, to: u } });
    return u;
  }, { revalidate: ['/accounts'] });
}

const updateSchema = z.object({
  full_name: z.string().trim().min(5, 'اكتبي الاسم ثلاثياً').max(120),
  phone: z.string().trim().max(20).optional(),
  role: z.enum(['admin', 'supervisor', 'teacher']).optional(),
  branch_id: z.string().uuid().nullable().optional(),
});

export async function updateAccount(id: string, input: z.input<typeof updateSchema>) {
  return run('account.update', ['admin', 'supervisor'], async ({ profile }) => {
    const t = await loadTarget(id);
    assertCanManage(profile, t);
    const v = parseOr(updateSchema, input);
    const patch: Record<string, unknown> = { full_name: v.full_name, phone: v.phone || null };
    if (profile.role === 'admin') {
      if (v.role) patch.role = v.role;
      if (v.role === 'admin') patch.branch_id = null;
      else if (v.branch_id !== undefined) patch.branch_id = v.branch_id;
      if (t.id === profile.id && v.role && v.role !== 'admin') throw new ActionError('لا يمكنك إزالة صلاحية الأدمن عن نفسك');
      if ((patch.role ?? t.role) !== 'admin' && !(patch.branch_id ?? t.branch_id)) throw new ActionError('حددي الفرع');
    }
    const admin = createAdminClient();
    must(await admin.from('profiles').update(patch).eq('id', t.id));
    // نقل المعلمة لفرع آخر يلغي إسناداتها القديمة
    if (patch.branch_id && patch.branch_id !== t.branch_id) {
      must(await admin.from('teacher_assignments').delete().eq('teacher_id', t.id));
    }
    await audit({ action: 'account.update', actor: profile, entity: 'profile', entityId: t.id, details: { ...patch, username: t.username } });
  }, { revalidate: ['/accounts'] });
}

export async function setAccountActive(id: string, active: boolean) {
  return run('account.set_active', ['admin', 'supervisor'], async ({ profile }) => {
    const t = await loadTarget(id);
    assertCanManage(profile, t);
    if (t.id === profile.id) throw new ActionError('لا يمكنك إيقاف حسابك');
    const admin = createAdminClient();
    must(await admin.from('profiles').update({ is_active: active }).eq('id', t.id));
    // منع الدخول فوراً على مستوى نظام المصادقة
    await admin.auth.admin.updateUserById(t.id, { ban_duration: active ? 'none' : '876000h' });
    await audit({ action: active ? 'account.activate' : 'account.deactivate', severity: 'warning', actor: profile, entity: 'profile', entityId: t.id, details: { username: t.username } });
  }, { revalidate: ['/accounts'] });
}

export async function deleteAccount(id: string) {
  return run('account.delete', ['admin'], async ({ profile }) => {
    const t = await loadTarget(id);
    if (t.id === profile.id) throw new ActionError('لا يمكنك حذف حسابك');
    const { error } = await createAdminClient().auth.admin.deleteUser(t.id);
    if (error) throw new ActionError('تعذّر الحذف');
    await audit({ action: 'account.delete', severity: 'warning', actor: profile, details: { username: t.username, name: t.full_name } });
  }, { revalidate: ['/accounts'] });
}

/** ملف إكسل ببيانات الدخول لتوزيعها على المعلمات */
export async function exportCredentials(list: Credential[], branchName?: string) {
  return run('account.export_credentials', ['admin', 'supervisor'], async () => {
    const wb = newBook();
    const ws = newSheet(wb, 'بيانات الدخول', false);
    ws.columns = [{ width: 6 }, { width: 34 }, { width: 14 }, { width: 20 }, { width: 16 }];
    const start = titleBlock(ws, 5, [
      { text: 'مِرقاة للرصد الذكي — بيانات الدخول', size: 15, bold: true },
      { text: `${branchName ?? ''}  ·  ${new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn')}`, size: 11, color: 'FF8A8A99' },
    ]);
    const head = ws.getRow(start);
    head.values = ['م', 'الاسم', 'الصلاحية', 'اسم المستخدم', 'كلمة المرور'];
    styleHeaderRow(head);
    list.forEach((c, i) => {
      const r = ws.getRow(start + 1 + i);
      r.values = [i + 1, c.full_name, ROLE_LABEL[c.role], c.username, c.password];
      styleBodyRow(r, i);
      r.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
      r.getCell(4).font = { name: 'Consolas', size: 12, bold: true };
      r.getCell(5).font = { name: 'Consolas', size: 12, bold: true };
    });
    const note = ws.getRow(start + list.length + 2);
    ws.mergeCells(note.number, 1, note.number, 5);
    note.getCell(1).value = 'سرّي — يُسلَّم لكل معلمة بشكل فردي. يُنصح بتغيير كلمة المرور بعد أول دخول من صفحة "حسابي".';
    note.getCell(1).font = { name: 'Arial', size: 10, color: { argb: 'FFC4365E' } };
    return toBase64(wb);
  }, { log: () => ({ count: list.length }) });
}
