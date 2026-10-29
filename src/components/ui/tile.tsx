import { cn } from '@/lib/utils';

const tones = {
  rose: 'bg-gradient-to-l from-rose-tile to-[#F3E1EC]',
  lilac: 'bg-gradient-to-l from-lilac-tile to-[#E6E2F3]',
  peri: 'bg-gradient-to-l from-peri-tile to-[#E4E6F6]',
};

/** بطاقة إحصائية بنمط الصورة: أيقونة دائرية + رقم كبير + وحدة صغيرة */
export function StatTile({ tone, icon, label, value, unit }: {
  tone: keyof typeof tones; icon: React.ReactNode; label: string; value: React.ReactNode; unit?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3.5 rounded-card px-4 py-3.5', tones[tone])}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-ink">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[13px] text-ink-soft">{label}</p>
        <p className="num text-[22px] font-semibold leading-tight text-ink">
          {value}
          {unit && <span className="mr-1.5 text-[13px] font-normal text-ink-muted">{unit}</span>}
        </p>
      </div>
    </div>
  );
}
