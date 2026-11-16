import { normAr } from './arabic';

export interface NameRow { id: string; name: string; branch_id: string; grade_id: string }
export interface SimilarPair { a: string; b: string; score: number; reason: string }

const tokens = (name: string) => normAr(name).split(' ').filter(Boolean);
const compact = (t: string[]) => t.join('');

function bigrams(s: string) {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); }
  return m;
}
/** معامل Dice على أزواج الحروف: 1 = متطابق تماماً */
export function dice(a: string, b: string) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a), B = bigrams(b);
  let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0);
  return (2 * inter) / (a.length - 1 + (b.length - 1));
}

/** مسافة تحرير محدودة (1 يكفي لكشف حرف ناقص/زائد/مبدّل) */
function within1(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
// التسامح بحرف واحد للكلمات الطويلة فقط (5 حروف فأكثر): محمد/أحمد وعلي/عمي أسماء مختلفة وليست أخطاء كتابة
const sameToken = (x: string, y: string) => x === y || (x.length >= 5 && y.length >= 5 && within1(x, y));

/** مقارنة اسمين: تُرجع درجة التشابه وسببه، أو null إن لم يتشابها */
export function compareNames(n1: string, n2: string): { score: number; reason: string } | null {
  const t1 = tokens(n1), t2 = tokens(n2);
  if (!t1.length || !t2.length) return null;
  const c1 = compact(t1), c2 = compact(t2);
  if (c1 === c2) return { score: 1, reason: 'نفس الاسم بعد توحيد الكتابة' };

  const [sh, lg] = t1.length <= t2.length ? [t1, t2] : [t2, t1];
  // نفس الكلمات بترتيب مختلف
  if (sh.length === lg.length && sh.length >= 2 && [...sh].sort().join(' ') === [...lg].sort().join(' ')) return { score: 0.95, reason: 'نفس الكلمات بترتيب مختلف' };

  // اسم أقصر داخل اسم أطول (مثلاً ثلاثي ورباعي) بشرط تطابق الاسم الأول
  if (sh.length >= 2 && lg.length > sh.length && sameToken(sh[0], lg[0])) {
    const used = new Set<number>();
    const hit = sh.filter((x) => { const k = lg.findIndex((y, i) => !used.has(i) && sameToken(x, y)); if (k >= 0) used.add(k); return k >= 0; }).length;
    if (hit === sh.length) return { score: 0.88, reason: 'اسم أقصر من الآخر (كلماته كلها موجودة في الأطول)' };
  }

  const d = dice(c1, c2);
  // اختلاف إملائي بسيط في الكلمات نفسها
  if (t1.length === t2.length && t1.length >= 3) {
    const diff = t1.filter((x, i) => !sameToken(x, t2[i])).length;
    if (diff === 0) return { score: Math.max(d, 0.93), reason: 'اختلاف إملائي بسيط' };
  }
  if (d >= 0.84 && sameToken(t1[0], t2[0])) return { score: d, reason: `تشابه عالٍ في الحروف (${Math.round(d * 100)}%)` };
  return null;
}

/** أزواج الأسماء المتشابهة داخل نفس الفرع والصف (شرط الدمج)، مرتبة من الأقوى */
export function findSimilar(rows: NameRow[], limit = 400): SimilarPair[] {
  const buckets = new Map<string, NameRow[]>();
  for (const r of rows) { const k = `${r.branch_id}|${r.grade_id}`; (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(r); }
  const out: SimilarPair[] = [];
  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const c = compareNames(list[i].name, list[j].name);
        if (c) out.push({ a: list[i].id, b: list[j].id, ...c });
      }
    }
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}
