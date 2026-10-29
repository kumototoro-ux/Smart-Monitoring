export type Role = 'admin' | 'supervisor' | 'teacher';
export type AssessmentMode = 'numeric' | 'verbal';
export type Gender = 'male' | 'female';

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  branch_id: string | null;
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface Settings {
  school_name: string;
  academic_year: string;
  current_term: 1 | 2;
  grading_open: boolean;
  edit_window_days: number;
  unlock_hours: number;
}

export interface Branch { id: string; name: string; code: string | null; is_active: boolean }
export interface Stage { id: string; name: string; sort_order: number }
export interface Grade {
  id: string; stage_id: string; name: string; sort_order: number;
  assessment_mode: AssessmentMode; is_active: boolean;
}
export interface Section { id: string; branch_id: string; grade_id: string; name: string; sort_order: number; is_active: boolean }
export interface Subject { id: string; name: string; kind: 'general' | 'kg'; sort_order: number; is_active: boolean }
export interface GradeSubject { id: string; grade_id: string; subject_id: string; sort_order: number }
export interface Component { id: string; grade_subject_id: string; name: string; max_score: number | null; sort_order: number }
export interface VerbalLevel { id: string; grade_id: string; label: string; sort_order: number }

export interface Student {
  id: string; branch_id: string; grade_id: string; section_id: string | null;
  full_name: string; national_id: string | null; student_number: string | null;
  name_en: string | null; birth_date: string | null; nationality: string | null; id_type: string | null;
  gender: Gender | null; source: 'import' | 'admin' | 'supervisor' | 'teacher';
  needs_review: boolean; is_active: boolean; created_at: string;
}

export interface ActionResult<T = undefined> {
  ok: boolean;
  message?: string;
  data?: T;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'مدير النظام',
  supervisor: 'مشرفة',
  teacher: 'معلمة',
};
