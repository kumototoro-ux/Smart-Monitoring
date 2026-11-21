-- 0025: مفتاح يتحكم بإدارة المشرفة لحسابات المعلمات (مُطفأ افتراضياً)
alter table public.settings add column if not exists supervisor_manage_accounts boolean not null default false;
