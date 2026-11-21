import { createAdminClient } from '@/lib/supabase/admin';

/** إدارة الحسابات للمشرفة مقفلة ما لم يفتحها الأدمن من الإعدادات (غياب العمود = مقفل) */
export async function supervisorAccountsOpen() {
  const { data, error } = await createAdminClient().from('settings').select('supervisor_manage_accounts').eq('id', 1).single();
  return !error && data?.supervisor_manage_accounts === true;
}
