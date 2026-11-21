/** تحويل ميلادي ↔ هجري بحساب ثابت (بدون Intl) كي يتطابق الخادم والمتصفح ولا يحدث خطأ hydration.
 *  التقويم الهجري الحسابي قد يختلف عن أم القرى بيوم واحد أحياناً. */
const pad = (n: number) => String(n).padStart(2, '0');

const jdFromGreg = (y: number, m: number, d: number) => {
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
};
const gregFromJd = (jd: number) => {
  const a = jd + 32044, b = Math.floor((4 * a + 3) / 146097), c = a - Math.floor(146097 * b / 4);
  const d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d / 4), m = Math.floor((5 * e + 2) / 153);
  return { d: e - Math.floor((153 * m + 2) / 5) + 1, m: m + 3 - 12 * Math.floor(m / 10), y: 100 * b + d - 4800 + Math.floor(m / 10) };
};
const jdFromHijri = (y: number, m: number, d: number) => d + Math.ceil(29.5 * (m - 1)) + (y - 1) * 354 + Math.floor((3 + 11 * y) / 30) + 1948440 - 1;
const hijriFromJd = (jd: number) => {
  const l = jd - 1948440 + 10632, n = Math.floor((l - 1) / 10631), l2 = l - 10631 * n + 354;
  const j = Math.floor((10985 - l2) / 5316) * Math.floor(50 * l2 / 17719) + Math.floor(l2 / 5670) * Math.floor(43 * l2 / 15238);
  const l3 = l2 - Math.floor((30 - j) / 15) * Math.floor(17719 * j / 50) - Math.floor(j / 16) * Math.floor(15238 * j / 43) + 29;
  const m = Math.floor(24 * l3 / 709);
  return { d: l3 - Math.floor(709 * m / 24), m, y: 30 * n + j - 30 };
};

/** يقرأ ما هو مخزَّن (2015-01-16 أو 1436/03/25 ...) ويُرجع التاريخين، أو null إن لم يُفهم. */
export function dualDate(raw: string | null | undefined): { greg: string; hijri: string } | null {
  const t = (raw ?? '').trim().replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
  const m = t.match(/^(\d{4})\D(\d{1,2})\D(\d{1,2})$/) ?? (() => { const r = t.match(/^(\d{1,2})\D(\d{1,2})\D(\d{4})$/); return r ? [r[0], r[3], r[2], r[1]] : null; })();
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let g: { y: number; m: number; d: number }, h: { y: number; m: number; d: number };
  if (y >= 1300 && y <= 1500) { h = { y, m: mo, d }; g = gregFromJd(jdFromHijri(y, mo, d)); }
  else if (y >= 1900 && y <= 2100) { g = { y, m: mo, d }; h = hijriFromJd(jdFromGreg(y, mo, d)); }
  else return null;
  return { greg: `${g.y}-${pad(g.m)}-${pad(g.d)}`, hijri: `${h.y}-${pad(h.m)}-${pad(h.d)}` };
}
