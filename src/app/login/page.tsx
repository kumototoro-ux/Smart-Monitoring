import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'تسجيل الدخول' };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-4 sm:p-8">
      <div className="grid w-full max-w-[980px] overflow-hidden rounded-shell bg-surface shadow-shell lg:grid-cols-[1fr_1.05fr]">
        <section className="flex flex-col justify-center px-6 py-10 sm:px-12 sm:py-14">
          <div className="mb-10 flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-black text-white">
              <svg viewBox="0 0 64 64" className="h-5 w-5" fill="currentColor"><path d="M14 46V20h7v19h7V28h8v11h7V18h7v28z" /></svg>
            </span>
            <span className="text-[18px] font-semibold">مِرقاة</span>
          </div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">أهلاً بك</h1>
          <p className="mt-2 text-[14.5px] text-ink-muted">سجّلي الدخول باسم المستخدم وكلمة المرور التي استلمتِها من الإدارة.</p>
          <LoginForm />
        </section>
        <aside className="relative hidden bg-gradient-to-br from-[#DCE2F7] via-[#E0DFF5] to-[#F6DCE3] p-10 lg:flex lg:flex-col lg:justify-end">
          <LoginArt />
          <p className="relative text-[22px] font-semibold leading-snug text-ink">رصد نهائي واحد،<br />بدقة لا تقبل الخطأ.</p>
          <p className="relative mt-2 max-w-xs text-[14px] leading-7 text-ink-soft">
            النظام ينبّهك لأي درجة تتجاوز العظمى وأي طالب لم يُرصد قبل الحفظ.
          </p>
        </aside>
      </div>
    </main>
  );
}

/** رسم أعمدة مستوحى من مخطط الصورة */
function LoginArt() {
  const bars = [62, 44, 70, 100, 66, 58, 30];
  return (
    <div className="absolute inset-x-10 top-12 flex h-64 items-end gap-3" aria-hidden>
      <div className="absolute inset-x-0 top-6 border-t-2 border-dashed border-rose/50" />
      {bars.map((h, i) => (
        <div
          key={i}
          className={i === 3 ? 'flex-1 rounded-2xl bg-peri/80' : 'flex-1 rounded-2xl bg-white/55'}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}
