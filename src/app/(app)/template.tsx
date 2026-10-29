'use client';
import { motion } from 'framer-motion';

/** حركة دخول ناعمة لكل صفحة عند التنقل */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}
