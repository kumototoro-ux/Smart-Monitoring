import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * فحص سريع: هل كل ملفات التحديث (migrations) مشغّلة في قاعدة البيانات؟
 * يجرّب عنصراً واحداً يُنشئه كل ملف، ويُرجع أسماء الملفات الناقصة بالترتيب.
 */
const MISSING = /PGRST20[0-5]|42703|42883|42P01|could not find|does not exist/i;
const ZERO = '00000000-0000-0000-0000-000000000000';

export async function missingMigrations(supabase: SupabaseClient): Promise<string[]> {
  const checks: [string, () => PromiseLike<{ error: { code?: string; message?: string } | null }>][] = [
    ['0003_section_pool.sql', () => supabase.rpc('section_pool', { p_section: ZERO })],
    ['0004_academic_number.sql', () => supabase.from('students').select('name_en').limit(1)],
    ['0006_section_links.sql', () => supabase.from('sections').select('id, grade:grades(name)').limit(1)],
    ['0007_student_reviews.sql', () => supabase.from('student_reviews').select('id').limit(1)],
  ];
  const res = await Promise.all(checks.map(async ([file, run]) => {
    try {
      const { error } = await run();
      return error && MISSING.test(`${error.code ?? ''} ${error.message ?? ''}`) ? file : null;
    } catch { return null; }
  }));
  return res.filter((x): x is string => !!x);
}
