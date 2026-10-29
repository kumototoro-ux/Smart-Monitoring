'use client';
import { startNavProgress } from '@/components/shell/nav-progress';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Inbox, Unlock, UserPlus, UserMinus, MessageSquare, Check, X, Ban } from 'lucide-react';
import { reviewRequest, cancelRequest } from '@/app/actions/grading';
import { useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty';
import { cn, fmtDateTime } from '@/lib/utils';
import type { Role } from '@/lib/types';

export interface RequestRow {
  id: string; type: 'unlock_sheet' | 'add_student' | 'remove_student' | 'other';
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  note: string | null; payload: Record<string, string>; term: number | null; created_at: string;
  reviewed_at: string | null; review_note: string | null;
  requester: { full_name: string } | null; reviewer: { full_name: string } | null; branch: { name: string } | null;
  section: { name: string; grade: { name: string } | null } | null;
  grade_subject: { subject: { name: string } | null } | null;
  student: { full_name: string } | null;
}

const TYPE = {
  unlock_sheet: { label: 'فتح كشف للتعديل', icon: Unlock },
  add_student: { label: 'إضافة طالب', icon: UserPlus },
  remove_student: { label: 'حذف طالب من الشعبة', icon: UserMinus },
  other: { label: 'طلب آخر', icon: MessageSquare },
};
const STATUS = {
  pending: <Badge tone="warning">قيد المراجعة</Badge>,
  approved: <Badge tone="success">مقبول</Badge>,
  rejected: <Badge tone="danger">مرفوض</Badge>,
  cancelled: <Badge>ملغي</Badge>,
};

export function RequestsClient({ role, status, rows }: { role: Role; status: string; rows: RequestRow[] }) {
  const router = useRouter();
  const [review, setReview] = useState<{ r: RequestRow; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  const { exec, busy } = useAction();
  const reviewer = role !== 'teacher';

  return (
    <>
      <div className="mb-4 inline-flex flex-wrap rounded-full bg-white p-1 shadow-soft">
        {[['pending', 'قيد المراجعة'], ['approved', 'المقبولة'], ['rejected', 'المرفوضة'], ['all', 'الكل']].map(([k, l]) => (
          <button key={k} onClick={() => { startNavProgress(); router.push(`/requests?status=${k}`); }}
            className={cn('rounded-full px-4 py-2 text-[13.5px] transition', status === k ? 'bg-black text-white' : 'text-ink-soft')}>{l}</button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card"><EmptyState icon={<Inbox className="h-6 w-6" />} title="لا توجد طلبات" hint={status === 'pending' ? 'كل الطلبات تمت مراجعتها.' : undefined} /></div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const T = TYPE[r.type];
            const sheet = [r.grade_subject?.subject?.name, r.section ? `${r.section.grade?.name ?? ''} شعبة ${r.section.name}` : null].filter(Boolean).join(' · ');
            return (
              <div key={r.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-peri-soft text-peri-deep"><T.icon className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14.5px] font-semibold">{T.label}</p>
                      {STATUS[r.status]}
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-muted">
                      {reviewer && <>{r.requester?.full_name}{role === 'admin' && r.branch ? ` (${r.branch.name})` : ''} · </>}
                      {fmtDateTime(r.created_at)}
                    </p>
                    {sheet && <p className="mt-2 text-[13.5px]">{sheet}</p>}
                    {r.type === 'add_student' && r.payload?.full_name && (
                      <p className="mt-2 rounded-xl bg-surface px-3 py-2 text-[13.5px]">الطالب: <b>{r.payload.full_name}</b>{r.payload.national_id ? ` · ${r.payload.national_id}` : ''}</p>
                    )}
                    {r.student && <p className="mt-2 text-[13.5px]">الطالب: <b>{r.student.full_name}</b></p>}
                    {r.note && <p className="mt-2 rounded-xl bg-surface px-3 py-2 text-[13px] leading-6 text-ink-soft">{r.note}</p>}
                    {r.status !== 'pending' && r.reviewed_at && (
                      <p className="mt-2 text-[12.5px] text-ink-muted">راجعته {r.reviewer?.full_name ?? '—'} · {fmtDateTime(r.reviewed_at)}{r.review_note ? ` — ${r.review_note}` : ''}</p>
                    )}
                  </div>
                  {r.status === 'pending' && (
                    <div className="flex w-full gap-2 sm:w-auto">
                      {reviewer ? (
                        <>
                          <Button size="sm" className="flex-1 sm:flex-none" onClick={() => { setNote(''); setReview({ r, approve: true }); }}><Check className="h-4 w-4" />قبول</Button>
                          <Button size="sm" variant="secondary" className="flex-1 sm:flex-none" onClick={() => { setNote(''); setReview({ r, approve: false }); }}><X className="h-4 w-4" />رفض</Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" className="text-rose" onClick={() => exec(() => cancelRequest(r.id), {
                          success: 'تم إلغاء الطلب', confirm: { title: 'إلغاء الطلب', message: 'هل تريدين إلغاء هذا الطلب؟', confirmText: 'إلغاء الطلب', cancelText: 'رجوع', tone: 'danger' },
                        })}><Ban className="h-4 w-4" />إلغاء</Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!review} onClose={() => setReview(null)} title={review?.approve ? 'قبول الطلب' : 'رفض الطلب'}
        description={review && <>{TYPE[review.r.type].label} — {review.r.requester?.full_name}
          {review.approve && review.r.type === 'unlock_sheet' && <><br />سيُفتح الكشف للمعلمة للتعديل لمدة محددة في الإعدادات.</>}
          {review.approve && review.r.type === 'add_student' && <><br />سيُضاف الطالب للشعبة مباشرة.</>}
          {review.approve && review.r.type === 'remove_student' && <><br />سيتم إيقاف الطالب من الشعبة.</>}</>}
        footer={<>
          <Button variant={review?.approve ? 'primary' : 'danger'} loading={busy} onClick={async () => {
            const res = await exec(() => reviewRequest(review!.r.id, review!.approve, note), { success: review!.approve ? 'تم قبول الطلب' : 'تم رفض الطلب' });
            if (res?.ok) setReview(null);
          }}>{review?.approve ? 'تأكيد القبول' : 'تأكيد الرفض'}</Button>
          <Button variant="secondary" onClick={() => setReview(null)}>إلغاء</Button>
        </>}>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="field h-auto py-2.5 leading-7" placeholder="ملاحظة للمعلمة (اختياري)" />
      </Dialog>
    </>
  );
}
