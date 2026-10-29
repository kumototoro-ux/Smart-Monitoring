import { requireRole } from '@/lib/auth';
import { getSettings } from '@/lib/data';
import { getTeacherSheets } from '@/lib/teacher';
import { GradingClient } from './grading-client';

export const metadata = { title: 'رصد الدرجات' };

export default async function GradingPage({ searchParams }: { searchParams: Promise<{ section?: string; subject?: string }> }) {
  const { supabase, profile } = await requireRole('teacher');
  const settings = await getSettings();
  const sheets = await getTeacherSheets(supabase, profile.id, settings.current_term, settings.academic_year);
  const sp = await searchParams;
  return <GradingClient sheets={sheets} gradingOpen={settings.grading_open} preset={{ section: sp.section, subject: sp.subject }} />;
}
