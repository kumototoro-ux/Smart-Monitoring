import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * عميل بصلاحية service_role — يتجاوز RLS.
 * يُستخدم فقط داخل Server Actions بعد التحقق من صلاحية المستخدم يدوياً.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY غير مضبوط');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
