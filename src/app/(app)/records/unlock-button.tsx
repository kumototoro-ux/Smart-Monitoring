'use client';
import { useState } from 'react';
import { Send } from 'lucide-react';
import { createRequest } from '@/app/actions/grading';
import { useAction } from '@/lib/use-action';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';

export function UnlockButton({ sectionId, gradeSubjectId, label }: { sectionId: string; gradeSubjectId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const { exec, busy } = useAction();
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Send className="h-4 w-4" />طلب فتح</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="طلب فتح الكشف للتعديل" description={label}
        footer={<>
          <Button loading={busy} onClick={async () => {
            const r = await exec(() => createRequest({ type: 'unlock_sheet', section_id: sectionId, grade_subject_id: gradeSubjectId, note }), { success: 'تم إرسال الطلب للمشرفة' });
            if (r?.ok) setOpen(false);
          }}>إرسال الطلب</Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>إلغاء</Button>
        </>}>
        <Field label="سبب التعديل">
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="field h-auto py-2.5 leading-7" placeholder="اكتبي سبب الحاجة للتعديل" />
        </Field>
      </Dialog>
    </>
  );
}
