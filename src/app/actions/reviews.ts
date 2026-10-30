'use server';
import { z } from 'zod';
import { run, parseOr } from '@/lib/action';

const uuid = z.string().uuid();
const action = z.enum(['approve', 'move', 'keep', 'restore', 'deactivate']);

/** قرار المشرفة/الأدمن على طالب في قائمة المراجعة */
export async function resolveReview(reviewId: string, act: z.input<typeof action>, sectionId?: string | null, note?: string) {
  return run('review.resolve', ['admin', 'supervisor'], async ({ supabase }) => {
    const { error } = await supabase.rpc('review_resolve', {
      p_review: parseOr(uuid, reviewId), p_action: parseOr(action, act),
      p_section: sectionId ? parseOr(uuid, sectionId) : null, p_note: note?.slice(0, 500) || null,
    });
    if (error) throw error;
  }, { revalidate: ['/reviews', '/students', '/'], context: { review_id: reviewId, action: act } });
}

/** اعتماد كل الطلاب المضافين الظاهرين دفعة واحدة */
export async function approveAllAdded(reviewIds: string[]) {
  return run('review.approve_all', ['admin', 'supervisor'], async ({ supabase }) => {
    const ids = parseOr(z.array(uuid).min(1).max(200), reviewIds);
    let done = 0;
    for (const id of ids) {
      const { error } = await supabase.rpc('review_resolve', { p_review: id, p_action: 'approve', p_section: null, p_note: null });
      if (!error) done++;
    }
    return done;
  }, { revalidate: ['/reviews', '/students', '/'] });
}
