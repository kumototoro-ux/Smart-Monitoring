'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle, ShieldCheck, Trash2 } from 'lucide-react';
import { Dialog } from './dialog';
import { Button } from './button';

type Tone = 'default' | 'danger' | 'success';
interface Opts {
  title: string;
  message?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: Tone;
}

const Ctx = createContext<(o: Opts) => Promise<boolean>>(async () => false);

/** رسالة تأكيد موحّدة لكل الموقع: const ok = await confirm({...}) */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<Opts | null>(null);
  const resolver = useRef<(v: boolean) => void>(undefined);

  const confirm = useCallback((o: Opts) => {
    setOpts(o);
    return new Promise<boolean>((res) => (resolver.current = res));
  }, []);

  const close = (v: boolean) => {
    resolver.current?.(v);
    setOpts(null);
  };

  const icon =
    opts?.tone === 'danger' ? <Trash2 className="h-6 w-6 text-rose" />
    : opts?.tone === 'success' ? <ShieldCheck className="h-6 w-6 text-mint" />
    : <AlertTriangle className="h-6 w-6 text-peri-deep" />;
  const bg = opts?.tone === 'danger' ? 'bg-rose-soft' : opts?.tone === 'success' ? 'bg-mint-soft' : 'bg-peri-soft';

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Dialog
        open={!!opts}
        onClose={() => close(false)}
        size="sm"
        title={opts?.title ?? ''}
        description={
          <div className="flex items-start gap-3 pt-2">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${bg}`}>{icon}</span>
            <div className="pt-1 text-[14px] leading-7 text-ink-soft">{opts?.message}</div>
          </div>
        }
        footer={
          <>
            <Button data-autofocus variant={opts?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)} className="sm:min-w-28">
              {opts?.confirmText ?? 'تأكيد'}
            </Button>
            <Button variant="secondary" onClick={() => close(false)}>
              {opts?.cancelText ?? 'إلغاء'}
            </Button>
          </>
        }
      />
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);
