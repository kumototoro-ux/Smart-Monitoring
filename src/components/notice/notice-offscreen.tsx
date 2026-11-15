'use client';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { NoticeSheet } from './notice-sheet';
import { capture, makePdf, type Captured } from './notice-export';
import { NOTICE_W, noticeFileName, type NoticeData, type NoticeRender } from '@/lib/notice';

/** يرسم الإشعار خارج الشاشة ويلتقطه (للتنزيل/المشاركة من القائمة وللدفعات) */
export class OffscreenRenderer {
  private host: HTMLDivElement;
  private root: ReturnType<typeof createRoot>;
  constructor() {
    this.host = document.createElement('div');
    this.host.style.cssText = `position:fixed;top:0;left:-${NOTICE_W + 300}px;width:${NOTICE_W}px;pointer-events:none;z-index:-1`;
    document.body.appendChild(this.host);
    this.root = createRoot(this.host);
  }
  async capture(data: NoticeData, render: NoticeRender): Promise<Captured> {
    flushSync(() => this.root.render(<NoticeSheet key={data.student.id} data={data} render={render} />));
    for (let f = 0; f < 60 && !this.host.querySelector('[data-fitted]'); f++) await new Promise((r) => requestAnimationFrame(() => r(null)));
    return capture(this.host.firstElementChild as HTMLElement);
  }
  async file(data: NoticeData, render: NoticeRender, kind: 'pdf' | 'png'): Promise<File> {
    const cap = await this.capture(data, render);
    const name = noticeFileName(data);
    return kind === 'png'
      ? new File([cap.png], `${name}.png`, { type: 'image/png' })
      : new File([await makePdf(cap, name)], `${name}.pdf`, { type: 'application/pdf' });
  }
  destroy() { this.root.unmount(); this.host.remove(); }
}
