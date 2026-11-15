'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Download, Image as ImageIcon, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { capture, makePdf, saveBlob, shareFile, lastShareError, type Captured } from './notice-export';
import {
  NOTICE_H, NOTICE_W, LEVELS_LEGEND, LEVELS_NOTE, fmtNum, levelEn, noticeFileName, principalTitle, rate, summarize, titles,
  type NoticeData, type NoticeRender,
} from '@/lib/notice';

/* =====================================================================
   إشعار درجات الفصل — بنسق الشهادة النهائية، بمقاس A4 ثابت (794×1123)
   يُعرض مصغّراً ليناسب أي شاشة، ويُصدَّر بمقاسه الأصلي صورةً أو PDF
   ===================================================================== */


const INK = '#1b2420';
const MINT = '#e3faf1';
const B = `1px solid ${INK}`;
const FONT = '"Readex Pro Variable", "IBM Plex Sans Arabic", system-ui, sans-serif';

const td = (x: React.CSSProperties = {}): React.CSSProperties => ({ border: B, padding: '3px 4px', textAlign: 'center', verticalAlign: 'middle', lineHeight: 1.25, fontVariantNumeric: 'tabular-nums', ...x });
const th = (x: React.CSSProperties = {}): React.CSSProperties => td({ background: MINT, fontWeight: 700, ...x });

function Img({ src, h, w }: { src?: string | null; h: number; w: number }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" style={{ maxHeight: h, maxWidth: w, objectFit: 'contain', display: 'block', margin: '0 auto' }} />;
}

/** تاريخ الإصدار بالهجري والميلادي بتوقيت الرياض */
function issued() {
  const d = new Date();
  const f = (cal: string) => new Intl.DateTimeFormat(`ar-SA-u-ca-${cal}-nu-latn`, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' }).format(d);
  return { h: f('islamic-umalqura'), g: f('gregory') };
}

/** كثافة الصفوف: قليل المواد صفوف أرحب، وكثيرها أضيق، لتبقى الصفحة A4 واحدة */
function density(rows: number, target: number | null) {
  const est = 470 / Math.max(1, rows);
  const rowH = Math.max(14, Math.min(44, target ?? est));
  const font = Math.max(9, Math.min(13.5, rowH * 0.5));
  const pad = Math.max(1, (rowH - font * 1.3 - 1) / 2);
  return { rowH, font, head: Math.max(8.5, Math.min(11, font - 1)), pad };
}

export function NoticeSheet({ data, render }: { data: NoticeData; render: NoticeRender }) {
  const { settings: S, branch: BR, brand } = render;
  const st = data.student;
  const T = titles(data, S);
  const numeric = data.grade.mode === 'numeric';
  const sum = summarize(data, S.bands);
  const pt = principalTitle(BR);
  const when = issued();
  const subjects = data.subjects;
  const logo = brand.logo;
  const vert: React.CSSProperties = { writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap', fontWeight: 700, fontSize: 12, margin: '0 auto' };
  const schoolAr = [data.school, data.branch.name].filter(Boolean).join(' · ');
  const schoolEn = [S.school_en, BR.name_en].filter(Boolean).join(' · ');

  // ضبط تلقائي بالقياس: ما عدا صفوف المواد ثابت، فيُوزَّع الباقي من الصفحة على الصفوف
  const box = useRef<HTMLDivElement>(null);
  const spacer = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<number | null>(null);
  const tries = useRef(0);
  const good = useRef<number | null>(null);
  const [fitted, setFitted] = useState(false);
  const nRows = Math.max(1, subjects.length);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = box.current;
      if (!el || !spacer.current) return;
      if (tries.current >= 99) return setFitted(true);
      const natural = el.offsetHeight - spacer.current.offsetHeight;
      let rowsH = 0;
      el.querySelectorAll<HTMLElement>('tr[data-row]').forEach((r) => (rowsH += r.offsetHeight));
      const limit = NOTICE_H - 4;
      const avg = rowsH / nRows;
      const fits = natural <= limit;
      if (fits) good.current = Math.max(good.current ?? 0, target ?? avg);
      else if (good.current != null && tries.current > 0) { setTarget(good.current); tries.current = 99; return; }
      const next = Math.max(14, Math.min(44, avg + (limit - natural) / nRows));
      const step = Math.floor(next * 4) / 4;
      if (Math.abs(next - avg) > 0.4 && tries.current < 6 && step !== target) { tries.current++; setTarget(step); } else setFitted(true);
    });
    return () => cancelAnimationFrame(id);
  }, [target, nRows]);
  const D = density(nRows, target);
  const rc = (x: React.CSSProperties = {}) => td({ padding: `${D.pad}px 4px`, whiteSpace: 'nowrap', overflow: 'hidden', ...x });
  const rh = (x: React.CSSProperties = {}) => th({ fontSize: D.head, padding: '3px 2px', lineHeight: 1.15, ...x });
  const long = (t: string | null | undefined, n: number) => { const l = (t ?? '').length; return l > n ? { fontSize: `${Math.max(0.72, n / l)}em` } : {}; };

  return (
    <div ref={box} data-fitted={fitted ? '1' : undefined} dir="rtl" style={{ width: NOTICE_W, minHeight: NOTICE_H, background: '#fff', color: INK, fontFamily: FONT, padding: 14, boxSizing: 'border-box' }}>
      <div style={{ border: '1.5px solid #356854', padding: 3, minHeight: NOTICE_H - 28, boxSizing: 'border-box', display: 'flex' }}>
        <div style={{ border: '0.75px solid #d9a441', flex: 1, padding: '14px 18px 12px', display: 'flex', flexDirection: 'column' }}>
          {/* الترويسة: الدولة يميناً، البسملة والشعار وسطاً، الإنجليزي وشعار الرؤية يساراً */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 230px 1fr', alignItems: 'center', gap: 10, minHeight: 150 }}>
            <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, lineHeight: 1.6 }}>{S.header_ar}</div>
            <div style={{ textAlign: 'center' }}>
              {S.show_basmala &&
                (brand.basmala ? (
                  <div style={{ marginBottom: 6 }}><Img src={brand.basmala} h={42} w={210} /></div>
                ) : (
                  <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.4, marginBottom: 4 }}>بسم الله الرحمن الرحيم</div>
                ))}
              {logo ? <Img src={logo} h={104} w={210} /> : <div style={{ height: 8 }} />}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div dir="ltr" style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, lineHeight: 1.6 }}>{S.header_en}</div>
              <Img src={brand.vision} h={92} w={190} />
            </div>
          </div>

          {/* العنوان */}
          <div style={{ textAlign: 'center', margin: '8px 0' }}>
            <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.5 }}>{T.ar}</div>
            {T.en && <div dir="ltr" style={{ fontSize: 13, fontWeight: 600, color: '#2c3a34' }}>{T.en}</div>}
          </div>

          {/* بيانات الطالب */}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 11.5 }}>
            <colgroup><col style={{ width: '15%' }} /><col style={{ width: '20%' }} /><col style={{ width: '15%' }} /><col style={{ width: '15%' }} /><col style={{ width: '20%' }} /><col style={{ width: '15%' }} /></colgroup>
            <tbody>
              <tr>
                <td style={th()}>العام الدراسي</td>
                <td style={td({ fontWeight: 700 })} colSpan={2}>{S.year_hijri || data.year}</td>
                <td style={td({ fontWeight: 700 })} colSpan={2} dir="ltr">{S.year_greg || '—'}</td>
                <td style={th()} dir="ltr">Academic Year</td>
              </tr>
              <tr>
                <td style={th()}>اسم المدرسة</td>
                <td style={td({ fontWeight: 700, ...long(schoolAr, 30) })} colSpan={2}>{schoolAr}</td>
                <td style={td({ fontWeight: 700, ...long(schoolEn, 30) })} colSpan={2} dir="ltr">{schoolEn || '—'}</td>
                <td style={th()} dir="ltr">School Name</td>
              </tr>
              <tr>
                <td style={th()}>اسم الطالب</td>
                <td style={td({ fontWeight: 700, ...long(st.name, 26) })} colSpan={2}>{st.name}</td>
                <td style={td({ fontWeight: 700, fontSize: (st.name_en ?? '').length > 34 ? 9.5 : 10.5 })} colSpan={2} dir="ltr">{(st.name_en ?? '').toUpperCase() || '—'}</td>
                <td style={th()} dir="ltr">Student Name</td>
              </tr>
              <tr>
                <td style={th()}>الصف والشعبة</td>
                <td style={td({ fontWeight: 600, ...long(T.gradeSection, 22) })}>{T.gradeSection}</td>
                <td style={th()} dir="ltr">Grade &amp; Section</td>
                <td style={th()}>مربية الفصل</td>
                <td style={td({ fontWeight: 600, ...long(data.homeroom, 22) })}>{data.homeroom || '—'}</td>
                <td style={th()} dir="ltr">Class Teacher</td>
              </tr>
              <tr>
                <td style={th()}>تاريخ الميلاد</td>
                <td style={td({ fontWeight: 600 })} dir="ltr">{st.birth_date || '—'}</td>
                <td style={th()} dir="ltr">Date of Birth</td>
                <td style={th()}>الجنسية</td>
                <td style={td({ fontWeight: 600 })}>{st.nationality || '—'}</td>
                <td style={th()} dir="ltr">Nationality</td>
              </tr>
              <tr>
                <td style={th()}>رقم الهوية</td>
                <td style={td({ fontWeight: 600 })} dir="ltr">{st.national_id || '—'}</td>
                <td style={th()} dir="ltr">Identity No.</td>
                <td style={th()}>الرقم الأكاديمي</td>
                <td style={td({ fontWeight: 600 })} dir="ltr">{st.number || '—'}</td>
                <td style={th()} dir="ltr">Student No.</td>
              </tr>
            </tbody>
          </table>

          {/* جدول الدرجات */}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: D.font, marginTop: 8 }}>
            <colgroup>
              <col style={{ width: '4%' }} />
              {numeric ? (<><col style={{ width: '22%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '11%' }} /><col style={{ width: '12%' }} /><col style={{ width: '24%' }} /></>)
                : (<><col style={{ width: '30%' }} /><col style={{ width: '20%' }} /><col style={{ width: '24%' }} /><col style={{ width: '22%' }} /></>)}
            </colgroup>
            <tbody>
              <tr>
                <th style={rh()} rowSpan={nRows + 1}><span style={vert}>الفصل الدراسي {data.term === 1 ? 'الأول' : 'الثاني'}</span></th>
                <th style={rh()}>المادة</th>
                {numeric ? (
                  <>
                    <th style={rh()}>الدرجة<div dir="ltr" style={{ fontWeight: 600 }}>Score</div></th>
                    <th style={rh()}>من<div dir="ltr" style={{ fontWeight: 600 }}>Out of</div></th>
                    <th style={rh()}>النسبة<div dir="ltr" style={{ fontWeight: 600 }}>Percent</div></th>
                    <th style={rh()}>التقدير</th>
                    <th style={rh()} dir="ltr">Grade</th>
                  </>
                ) : (
                  <>
                    <th style={rh()}>التقدير اللفظي</th>
                    <th style={rh()} dir="ltr">Verbal Level</th>
                  </>
                )}
                <th style={rh()} dir="ltr">Subject</th>
              </tr>
              {subjects.map((s) => {
                const pct = s.max > 0 && s.total != null ? (Number(s.total) / s.max) * 100 : null;
                const rt = rate(pct, S.bands);
                return (
                  <tr key={s.id} data-row>
                    <td style={rc({ fontWeight: 700, ...long(s.name, 26) })}>{s.name}</td>
                    {numeric ? (
                      <>
                        <td style={rc({ fontWeight: 700 })} dir="ltr">{s.absent && s.total == null ? 'غ' : fmtNum(s.total)}</td>
                        <td style={rc()} dir="ltr">{fmtNum(s.max)}</td>
                        <td style={rc()} dir="ltr">{pct == null ? '' : `${Math.round(pct)}%`}</td>
                        <td style={rc({ fontWeight: 600 })}>{rt?.ar ?? ''}</td>
                        <td style={rc()} dir="ltr">{rt?.en ?? ''}</td>
                      </>
                    ) : (
                      <>
                        <td style={rc({ fontWeight: 600 })}>{s.absent ? 'غائب' : s.level ?? ''}</td>
                        <td style={rc()} dir="ltr">{s.absent ? 'Absent' : levelEn(s.level, S)}</td>
                      </>
                    )}
                    <td style={rc({ fontWeight: 700, ...long(s.name_en, 20) })} dir="ltr">{s.name_en ?? ''}</td>
                  </tr>
                );
              })}
              {!subjects.length && (
                <tr data-row><td style={rc({ padding: 10, color: '#6b7a72' })} colSpan={numeric ? 7 : 4}>لا درجات معتمدة · No grades</td></tr>
              )}
            </tbody>
          </table>

          {/* شرح مستويات الطالب (التقييم اللفظي) */}
          {!numeric && S.show_levels_legend && (
            <div style={{ border: B, marginTop: 8, padding: '6px 10px 7px', fontSize: 9.5, lineHeight: 1.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 11.5, marginBottom: 3 }}>
                <span>مستوى الطالب:</span><span dir="ltr">Student’s Level:</span>
              </div>
              {LEVELS_LEGEND.map((l) => (
                <div key={l.en} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '3px 0', borderTop: '0.5px solid #c9d3ce' }}>
                  <div>{l.ar}</div>
                  <div dir="ltr" style={{ textAlign: 'left', color: '#2c3a34' }}>{l.en}</div>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '4px 0 0', borderTop: '0.5px solid #c9d3ce', fontWeight: 600 }}>
                <div>{LEVELS_NOTE.ar}</div>
                <div dir="ltr" style={{ textAlign: 'left' }}>{LEVELS_NOTE.en}</div>
              </div>
            </div>
          )}

          {/* المديرة والتوقيع والختم | الملخص */}
          <div style={{ display: 'grid', gridTemplateColumns: render.showStamp ? '1fr 130px 1.35fr' : '1fr 1.35fr', gap: 12, marginTop: 10, alignItems: 'center' }}>
            <div style={{ textAlign: 'center', alignSelf: 'start' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{pt.ar}</div>
              <div dir="ltr" style={{ fontSize: 10.5, fontWeight: 600, color: '#55645d' }}>{pt.en}</div>
              {BR.principal_name && <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 5 }}>{BR.principal_name}</div>}
              {BR.principal_name_en && <div dir="ltr" style={{ fontSize: 10.5, color: '#55645d' }}>{BR.principal_name_en}</div>}
              {render.showSignature && brand.signature && (
                <div style={{ height: 70, marginTop: 2, display: 'grid', placeItems: 'center' }}><Img src={brand.signature} h={66} w={170} /></div>
              )}
            </div>
            {render.showStamp && <div style={{ display: 'grid', placeItems: 'center' }}><Img src={brand.stamp} h={122} w={126} /></div>}
            {sum ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 11.5 }}>
                <colgroup><col style={{ width: '30%' }} /><col style={{ width: '20%' }} /><col style={{ width: '20%' }} /><col style={{ width: '30%' }} /></colgroup>
                <tbody>
                  <tr><td style={th()}>المجموع</td><td style={td({ fontWeight: 700, fontSize: 13 })} colSpan={2} dir="ltr">{fmtNum(sum.total)} / {fmtNum(sum.max)}</td><td style={th()} dir="ltr">Total</td></tr>
                  <tr><td style={th()}>المعدل</td><td style={td({ fontWeight: 700, fontSize: 13 })} colSpan={2} dir="ltr">{sum.avg == null ? '—' : `${fmtNum(sum.avg)}%`}</td><td style={th()} dir="ltr">Average</td></tr>
                  <tr><td style={th()}>التقدير العام</td><td style={td({ fontWeight: 700, fontSize: 12.5 })}>{sum.rating?.ar ?? '—'}</td><td style={td({ fontWeight: 700 })} dir="ltr">{sum.rating?.en ?? '—'}</td><td style={th()} dir="ltr">General Grade</td></tr>
                </tbody>
              </table>
            ) : <div />}
          </div>

          <div ref={spacer} style={{ flex: 1 }} />
          {S.show_disclaimer && (
            <div style={{ border: '1px dashed #d9a441', background: '#fbf5e6', borderRadius: 10, padding: '7px 12px', fontSize: 11, lineHeight: 1.7, color: '#5b4511', textAlign: 'center', marginTop: 8 }}>
              هذا إشعار بدرجات الفصل الدراسي فقط وليس شهادة نهائية
              <div dir="ltr" style={{ fontSize: 10, color: '#7a6326' }}>This notice reports term grades only; it is not a final certificate.</div>
            </div>
          )}
          <div style={{ textAlign: 'center', marginTop: 7, fontSize: 9, color: '#6b7a72' }}>
            تاريخ الإصدار: {when.h} · الموافق {when.g}
            {S.show_footer ? ' · صادر إلكترونيًا من منصة مِرقاة للرصد الذكي' : ''}
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/** يعرض الإشعار مصغّراً، مع تنزيله أو مشاركته (واتساب) بمقاسه الأصلي. الصورة تُجهَّز مسبقاً فتكون الأزرار فورية */
export function NoticeViewer({ data, render, onExported, extra }: {
  data: NoticeData; render: NoticeRender; onExported?: (kind: 'pdf' | 'png') => void; extra?: React.ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(NOTICE_H);
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const toast = useToast();
  const fileName = noticeFileName(data);
  const prep = useRef<Promise<Captured> | null>(null);
  const pdf = useRef<Promise<Blob> | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      setScale(Math.min(1, el.clientWidth / NOTICE_W));
      if (sheet.current) setHeight(sheet.current.offsetHeight);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    if (sheet.current) ro.observe(sheet.current);
    return () => ro.disconnect();
  }, []);

  /** الالتقاط بعد استقرار الصفوف، مرة واحدة لكل إشعار، ويُعاد استعماله في كل الأزرار */
  const getCapture = () => {
    prep.current ??= (async () => {
      for (let f = 0; f < 60 && !sheet.current?.querySelector('[data-fitted]'); f++) await new Promise((r) => requestAnimationFrame(() => r(null)));
      return capture(sheet.current!);
    })();
    prep.current.catch(() => { prep.current = null; });
    return prep.current;
  };
  const getPdf = () => {
    pdf.current ??= getCapture().then((c) => makePdf(c, fileName));
    pdf.current.catch(() => { pdf.current = null; });
    return pdf.current;
  };
  // تجهيز مسبق في وقت الفراغ بعد ظهور الإشعار
  useEffect(() => {
    prep.current = null; pdf.current = null;
    const t = setTimeout(() => { void getPdf().catch(() => {}); }, 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, render]);

  const fileOf = async (kind: 'pdf' | 'png') => kind === 'png'
    ? new File([(await getCapture()).png], `${fileName}.png`, { type: 'image/png' })
    : new File([await getPdf()], `${fileName}.pdf`, { type: 'application/pdf' });

  const download = async (kind: 'png' | 'pdf') => {
    setBusy(kind);
    try {
      const f = await fileOf(kind);
      saveBlob(f, f.name);
      toast.success(kind === 'png' ? 'نُزّل الإشعار صورة' : 'نُزّل الإشعار PDF');
      onExported?.(kind);
    } catch {
      toast.error('تعذّر التنزيل', 'حدّثي الصفحة وحاولي مجدداً');
    } finally { setBusy(null); }
  };

  const share = async (kind: 'png' | 'pdf') => {
    setMenu(false); setBusy('share');
    try {
      const f = await fileOf(kind);
      const r = await shareFile(f, `إشعار درجات الطالب ${data.student.name}`);
      if (r === 'fallback') toast.success('تعذّرت المشاركة المباشرة فنُزّل الملف', `أرفقيه في واتساب يدوياً (${lastShareError})`);
      if (r !== 'cancelled') onExported?.(kind);
    } catch {
      toast.error('تعذّرت المشاركة', 'نزّلي الملف ثم أرسليه يدوياً');
    } finally { setBusy(null); }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button onClick={() => download('pdf')} loading={busy === 'pdf'} disabled={!!busy}><Download className="h-4 w-4" />تنزيل PDF</Button>
        <Button variant="secondary" onClick={() => download('png')} loading={busy === 'png'} disabled={!!busy}><ImageIcon className="h-4 w-4" />تنزيل صورة</Button>
        <div className="relative">
          <Button variant="soft" onClick={() => setMenu((m) => !m)} loading={busy === 'share'} disabled={!!busy}><Share2 className="h-4 w-4" />مشاركة عبر واتساب</Button>
          {menu && (
            <>
              <button type="button" aria-label="إغلاق" className="fixed inset-0 z-40 cursor-default" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-2xl border border-line bg-white shadow-pop">
                <button type="button" className="block w-full px-4 py-3 text-right text-[14px] hover:bg-surface" onClick={() => share('pdf')}>مشاركة PDF</button>
                <button type="button" className="block w-full border-t border-line px-4 py-3 text-right text-[14px] hover:bg-surface" onClick={() => share('png')}>مشاركة صورة</button>
              </div>
            </>
          )}
        </div>
        <span className="text-[12.5px] text-ink-muted">A4 بجودة عالية</span>
        {extra}
      </div>
      <div ref={wrap} className="w-full">
        {/* الورقة بعرضها الأصلي (794px) خارج التدفق ومقصوصة داخل الإطار، فلا تُوسّع الصفحة في الجوال */}
        <div className="relative overflow-hidden rounded-2xl border border-line shadow-soft" style={{ width: NOTICE_W * scale, height: height * scale, maxWidth: '100%', contain: 'paint' }}>
          <div ref={sheet} style={{ width: NOTICE_W, position: 'absolute', top: 0, right: 0, transform: `scale(${scale})`, transformOrigin: 'top right' }}>
            <NoticeSheet data={data} render={render} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** معاينة مصغّرة بلا أزرار تنزيل (لصفحة الإعدادات) */
export function NoticePreview({ data, render }: { data: NoticeData; render: NoticeRender }) {
  const wrap = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [height, setHeight] = useState(NOTICE_H);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      setScale(Math.min(1, el.clientWidth / NOTICE_W));
      if (sheet.current) setHeight(sheet.current.offsetHeight);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    if (sheet.current) ro.observe(sheet.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={wrap} className="w-full">
      <div className="relative overflow-hidden rounded-xl border border-line bg-white shadow-soft" style={{ width: NOTICE_W * scale, height: height * scale, maxWidth: '100%', contain: 'paint' }}>
        <div ref={sheet} style={{ width: NOTICE_W, position: 'absolute', top: 0, right: 0, transform: `scale(${scale})`, transformOrigin: 'top right' }}>
          <NoticeSheet data={data} render={render} />
        </div>
      </div>
    </div>
  );
}
