'use client';
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { logout } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';

export function LogoutButton() {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="danger" loading={busy} onClick={async () => {
      if (!(await confirm({ title: 'تسجيل الخروج', message: 'هل تريدين تسجيل الخروج من النظام؟', confirmText: 'خروج', tone: 'danger' }))) return;
      setBusy(true);
      try { await logout(); } finally { setBusy(false); }
    }}>
      <LogOut className="h-4 w-4" />تسجيل الخروج
    </Button>
  );
}
