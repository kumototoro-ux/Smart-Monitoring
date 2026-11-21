import type ExcelJS from 'exceljs';

const pad = (n: number) => String(n).padStart(2, '0');

/** رقم إكسل التسلسلي → تاريخ ميلادي YYYY-MM-DD (أصل التقويم 1899-12-30). */
function serialToIso(n: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** تاريخ هجري (أم القرى) YYYY-MM-DD لرقم إكسل تسلسلي. */
function serialToHijri(n: number): string | null {
  try {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
    const p = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(d);
    const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
    const y = g('year').replace(/\D/g, ''), m = g('month'), day = g('day');
    return y && m && day ? `${y}-${pad(Number(m))}-${pad(Number(day))}` : null;
  } catch { return null; }
}

/** هل صيغة الخلية تُعرض بالتقويم الهجري؟ */
const isHijriFmt = (fmt: string | undefined) => !!fmt && /B2|\[\$-[0-9a-f]*(1170000|1060401|0401|ar-SA)[^\]]*\]|ar-SA/i.test(fmt);

/**
 * يقرأ خلية «تاريخ» كما تراها المستخدمة: التاريخ الحقيقي يُحفظ YYYY-MM-DD،
 * والرقم التسلسلي (مثل 42020) يُحوَّل إلى تاريخ بدل أن يُحفظ رقماً.
 * ما عدا ذلك (نص كتبته بنفسها كـ 1436/03/25) يُحفظ كما هو.
 */
export function dateCellText(cell: ExcelJS.Cell, fallback: (v: ExcelJS.CellValue) => string): string {
  const v = cell.value;
  if (v == null) return '';
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  const serialLike = (n: number) => Number.isInteger(n) && n >= 10000 && n <= 80000;
  let n: number | null = null;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\d{5}$/.test(v.trim())) n = Number(v.trim());
  else if (typeof v === 'object' && 'result' in v && typeof v.result === 'number') n = v.result;
  if (n !== null && serialLike(n)) {
    if (isHijriFmt(cell.numFmt)) return serialToHijri(n) ?? serialToIso(n);
    return serialToIso(n);
  }
  return fallback(v);
}
