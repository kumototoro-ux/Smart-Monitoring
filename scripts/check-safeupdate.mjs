// يفحص ملفات الهجرة: Supabase يفعّل pg_safeupdate فيرفض أي UPDATE/DELETE بلا WHERE.
// الاستعمال: node scripts/check-safeupdate.mjs
import fs from 'node:fs';
const dir = new URL('../supabase/migrations/', import.meta.url);
let bad = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  const s = fs.readFileSync(new URL(f, dir), 'utf8').replace(/--[^\n]*/g, '');
  for (const m of s.matchAll(/(?<![\w.])(update\s+[\w.]+(?:\s+\w+)?\s+set|delete\s+from)\b[^;]*?;/gis)) {
    if (!/\bwhere\b/i.test(m[0]) && !/\busing\b/i.test(m[0])) { bad++; console.log(`${f}: ${m[0].replace(/\s+/g, ' ').slice(0, 100)}`); }
  }
}
console.log(bad ? `✗ ${bad} عبارة بلا WHERE` : '✓ كل عبارات UPDATE/DELETE فيها WHERE');
process.exit(bad ? 1 : 0);
