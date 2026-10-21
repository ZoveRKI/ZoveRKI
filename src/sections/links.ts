// 头部下面的一排链接按钮：每个按钮单独一张图，才能分别点击
import type { Link } from '../config.ts';
import { arrow, segment } from '../frame.ts';
import { delay, esc, r2, truncate } from '../svg.ts';
import { type Geo, theme as t } from '../theme.ts';

export async function linkButton(g: Geo, l: Link, k: number, n: number): Promise<string> {
  const sw = g.w / n;
  const h = g.phone ? 60 : 80;
  const inset = g.phone ? 12 : 20;
  // 最外侧的两段要让出窗口边框外的边距
  const left = k === 0 ? g.left : inset;
  const right = k === n - 1 ? sw - (g.w - g.right) : sw - inset;
  const labelY = g.phone ? 28 : 36;
  const divider =
    k < n - 1
      ? `<line x1="${r2(sw - 0.5)}" y1="${g.phone ? 14 : 18}" x2="${r2(sw - 0.5)}" y2="${h - (g.phone ? 14 : 18)}" stroke="${t.line}"/>\n`
      : '';
  const note = l.note
    ? `<text x="${r2(left)}" y="${labelY + 20}" class="faint" font-size="${g.small - 1}">${esc(truncate(l.note, g.small - 1, right - left))}</text>`
    : '';
  const body = `${divider}<g class="in" ${delay(0.1 + k * 0.08)}>
<text x="${r2(left)}" y="${labelY}" font-weight="700" class="ac">${esc(truncate(l.label, g.fs, right - left - 20))}</text>
${arrow(right - 10, labelY - 10, 9, t.faint)}
${note}
</g>`;
  return segment(g, k, n, h, body, { title: l.label });
}
