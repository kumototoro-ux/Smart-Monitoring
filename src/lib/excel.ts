import 'server-only';
import ExcelJS from 'exceljs';

export const XL = {
  ink: 'FF1B1B22', muted: 'FF8A8A99', head: 'FF1B1B22', headText: 'FFFFFFFF',
  band: 'FFF5F5F9', line: 'FFE2E2EA', peri: 'FFDCE2F7', rose: 'FFF6DCE3', mint: 'FFE3F4EC', amber: 'FFFBF1DD',
};

export function newBook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'مِرقاة للرصد الذكي';
  wb.created = new Date();
  return wb;
}

export function newSheet(wb: ExcelJS.Workbook, name: string, landscape = true) {
  return wb.addWorksheet(name.replace(/[\\/?*[\]:]/g, '-').slice(0, 31), {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 0 }],
    pageSetup: {
      paperSize: 9, orientation: landscape ? 'landscape' : 'portrait',
      fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    headerFooter: { oddFooter: '&Lمِرقاة للرصد الذكي&Rصفحة &P من &N' },
  });
}

export const thin = { style: 'thin' as const, color: { argb: XL.line } };
export const box = { top: thin, left: thin, bottom: thin, right: thin };

export function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 30;
  row.eachCell((c) => {
    c.font = { name: 'Arial', bold: true, size: 11, color: { argb: XL.headText } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.head } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = box;
  });
}

export function styleBodyRow(row: ExcelJS.Row, i: number) {
  row.height = 22;
  row.eachCell({ includeEmpty: true }, (c) => {
    c.font = { name: 'Arial', size: 11, color: { argb: XL.ink } };
    c.alignment = { vertical: 'middle', horizontal: 'center' };
    c.border = box;
    if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL.band } };
  });
}

/** عنوان كبير مدمج أعلى الورقة */
export function titleBlock(ws: ExcelJS.Worksheet, cols: number, lines: { text: string; size?: number; bold?: boolean; color?: string }[]) {
  lines.forEach((l, i) => {
    const r = ws.getRow(i + 1);
    ws.mergeCells(i + 1, 1, i + 1, cols);
    const c = r.getCell(1);
    c.value = l.text;
    c.font = { name: 'Arial', size: l.size ?? 12, bold: l.bold ?? false, color: { argb: l.color ?? XL.ink } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    r.height = (l.size ?? 12) + 12;
  });
  return lines.length + 2; // رقم أول صف بعد العنوان مع فراغ
}

export async function toBase64(wb: ExcelJS.Workbook) {
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer).toString('base64');
}
