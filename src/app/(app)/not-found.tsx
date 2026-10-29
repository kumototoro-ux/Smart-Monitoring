import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty';

export default function NotFound() {
  return (
    <div className="card">
      <EmptyState icon={<SearchX className="h-6 w-6" />} title="الصفحة غير موجودة"
        action={<Link href="/" className="rounded-full bg-black px-5 py-2.5 text-[14px] text-white">العودة للرئيسية</Link>} />
    </div>
  );
}
