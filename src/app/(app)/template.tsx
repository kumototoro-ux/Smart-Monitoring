'use client';
import { motion, useReducedMotion } from 'framer-motion';

/** حركة دخول خفيفة وسريعة لكل صفحة — لا تخفي المحتوى (تبدأ من شفافية 0.6) */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div initial={{ opacity: 0.6, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16, ease: 'easeOut' }}>
      {children}
    </motion.div>
  );
}
