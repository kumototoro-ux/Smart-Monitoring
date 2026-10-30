'use client';
import { useState } from 'react';
import { Eye, EyeOff, Sparkles, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PasswordMode = 'auto' | 'manual';

/** اختيار كلمة المرور: تلقائية أو يكتبها المستخدم */
export function PasswordChoice({ mode, onMode, value, onChange }: {
  mode: PasswordMode; onMode: (m: PasswordMode) => void; value: string; onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(true);
  const tooShort = mode === 'manual' && value.length > 0 && value.length < 6;
  return (
    <div>
      <p className="label">كلمة المرور</p>
      <div className="grid grid-cols-2 gap-2">
        {([['auto', 'تلقائية', 'النظام يولّدها', Sparkles], ['manual', 'أكتبها بنفسي', 'حسب رغبة المعلمة', KeyRound]] as const).map(([k, l, h, Icon]) => (
          <button key={k} type="button" onClick={() => onMode(k)}
            className={cn('flex items-start gap-2.5 rounded-2xl border p-3 text-right transition', mode === k ? 'border-black ring-2 ring-black/5' : 'border-line hover:border-ink-faint')}>
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', mode === k ? 'text-ink' : 'text-ink-muted')} />
            <span>
              <span className="block text-[13.5px] font-medium">{l}</span>
              <span className="block text-[11.5px] text-ink-muted">{h}</span>
            </span>
          </button>
        ))}
      </div>
      {mode === 'manual' && (
        <div className="mt-3">
          <div className="relative">
            <input
              type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value.replace(/\s/g, ''))}
              dir="ltr" autoComplete="new-password" autoCapitalize="none" spellCheck={false} placeholder="6 أحرف أو أرقام على الأقل"
              className={cn('field pl-11 text-right font-mono', tooShort && 'border-amber focus:border-amber focus:ring-amber/15')}
            />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-ink-muted hover:text-ink" aria-label={show ? 'إخفاء' : 'إظهار'}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className={cn('mt-1.5 text-[12px]', tooShort ? 'text-amber' : 'text-ink-muted')}>
            {tooShort ? `باقي ${6 - value.length} على الأقل` : 'بدون مسافات، وتجنّبي السهلة مثل 123456'}
          </p>
        </div>
      )}
    </div>
  );
}
