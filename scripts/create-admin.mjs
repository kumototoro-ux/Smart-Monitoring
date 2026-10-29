// إنشاء أول حساب أدمن — يُشغَّل مرة واحدة فقط
// الاستخدام:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-admin.mjs admin "اسم المدير" كلمة_المرور
import { createClient } from '@supabase/supabase-js';

const [username, fullName, password] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) { console.error('✘ اضبطي NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!username || !fullName || !password) { console.error('✘ الاستخدام: node scripts/create-admin.mjs <username> "<الاسم>" <password>'); process.exit(1); }
if (!/^[a-z0-9._-]{3,32}$/.test(username)) { console.error('✘ اسم المستخدم: أحرف إنجليزية صغيرة وأرقام فقط'); process.exit(1); }
if (password.length < 8) { console.error('✘ كلمة المرور 8 أحرف على الأقل'); process.exit(1); }

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await sb.auth.admin.createUser({
  email: `${username}@mirqat.local`, password, email_confirm: true, user_metadata: { username },
});
if (error) { console.error('✘', error.message); process.exit(1); }
const { error: pErr } = await sb.from('profiles').insert({ id: data.user.id, username, full_name: fullName, role: 'admin' });
if (pErr) { await sb.auth.admin.deleteUser(data.user.id); console.error('✘', pErr.message); process.exit(1); }
console.log(`✔ تم إنشاء حساب الأدمن: ${username}`);
