/** توحيد النص العربي للمقارنة: الهمزات، التاء المربوطة، الياء، التشكيل، المسافات */
export function normAr(s: unknown): string {
  return String(s ?? '')
    .replace(/[ً-ْٰـ]/g, '') // تشكيل وتطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const ORD: Record<string, string> = {
  '1': 'اول', '2': 'ثاني', '3': 'ثالث', '4': 'رابع', '5': 'خامس', '6': 'سادس',
  اولي: 'اول', ثانيه: 'ثاني', ثالثه: 'ثالث',
  ابتدايي: 'ابتدايي', ابتداييه: 'ابتدايي', متوسط: 'متوسط', متوسطه: 'متوسط', ثانوي: 'ثانوي', ثانويه: 'ثانوي',
  روضه: 'تمهيدي', تمهيدي: 'تمهيدي', kg: 'تمهيدي',
};

/** مفتاح مقارنة لأسماء الصفوف: "1 ابتدائي" = "الأول الابتدائي" = "اول ابتدائي" */
export function gradeKey(s: unknown): string {
  return normAr(s)
    .replace(/(\d)([^\d\s])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.startsWith('ال') && w.length > 3 ? w.slice(2) : w))
    .map((w) => ORD[w] ?? w)
    .filter((w) => !['صف', 'الصف', 'مرحله'].includes(w))
    .sort()
    .join(' ');
}

/** مفتاح للشعب: "أ" = "1" = "شعبة أ" = "فصل 1" */
export function sectionKey(s: unknown): string {
  const map: Record<string, string> = { ا: '1', ب: '2', ج: '3', د: '4', ه: '5', و: '6', ز: '7', ح: '8' };
  const w = normAr(s).replace(/^(شعبه|فصل|الفصل|الشعبه)\s*/, '').trim();
  return map[w] ?? w;
}
