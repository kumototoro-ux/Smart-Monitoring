'use server';
import { z } from 'zod';
import { run, must, ActionError } from '@/lib/action';

const year = z.string().trim().min(1, 'اكتبي العام').max(20, 'العام طويل جداً');

export interface YearMoveResult { results: number; submissions: number; exclusions: number; drafts: number; notice_issues: number; made_current: boolean }

/** نقل بيانات عام إلى عام فارغ (للأدمن فقط، والرصد مغلق). التراجع = نقل عكسي. */
export async function moveAcademicYear(from: string, to: string, makeCurrent: boolean) {
  return run('settings.year_move', ['admin'], async ({ supabase }) => {
    const f = year.safeParse(from), t = year.safeParse(to);
    if (!f.success) throw new ActionError(f.error.issues[0].message);
    if (!t.success) throw new ActionError(t.error.issues[0].message);
    const data = must(await supabase.rpc('year_move', { p_from: f.data, p_to: t.data, p_make_current: !!makeCurrent }));
    return data as YearMoveResult;
  }, { revalidate: ['/', '/settings', '/settings/years', '/results', '/grading'], log: (d) => ({ ...d }) });
}
