// 语言占比：一条按代码量分段的条形图，下面是图例
import type { Ctx } from '../context.ts';
import { sectionTop, slice } from '../frame.ts';
import { delay, esc, r2, textWidth, truncate } from '../svg.ts';
import { type Geo, theme as t, up } from '../theme.ts';

const pct = (p: number): string => `${p.toFixed(1)}%`;

/** 统计范围：有私有仓库的数据时，公开和私有的合在一起算 */
const scope = (c: Ctx): string => (c.s.privateLanguages.length ? 'public and private repos' : 'public repos');

export const languagesAlt = (c: Ctx): string =>
  `Languages by bytes of code in ${scope(c)}: ${c.langs.map((l) => `${l.name} ${pct(l.pct)}`).join(', ')}.`;

export async function languages(g: Geo, c: Ctx): Promise<string> {
  const W = g.right - g.left;
  const barY = g.top + 2;
  const barH = g.phone ? 10 : 12;
  let x = g.left;
  const segments = c.langs
    .map((l, i) => {
      const w = (W * l.pct) / 100;
      // 段与段之间留 2px 缝，最后一段填满
      const width = i === c.langs.length - 1 ? g.right - x : Math.max(1, w - 2);
      const seg = `<rect x="${r2(x)}" y="${barY}" width="${r2(width)}" height="${barH}" fill="${l.color}" class="grow" ${delay(0.2 + i * 0.1)}/>`;
      x += w;
      return seg;
    })
    .join('');

  const cols = g.phone ? 2 : 3;
  const colW = W / cols;
  const rowStep = g.phone ? 26 : 28;
  const legendY = barY + barH + (g.phone ? 30 : 34);
  const items = c.langs
    .map((l, i) => {
      const lx = g.left + (i % cols) * colW;
      const ly = legendY + Math.floor(i / cols) * rowStep;
      const p = pct(l.pct);
      const name = truncate(l.name, g.small + 1, colW - 48 - textWidth(p, g.small));
      return `<g class="in" ${delay(0.3 + i * 0.06)}><rect x="${r2(lx)}" y="${ly - 10}" width="10" height="10" rx="2" fill="${l.color}"/><text x="${r2(lx + 18)}" y="${ly}" font-size="${g.small + 1}">${esc(name)}</text><text x="${r2(lx + colW - 24)}" y="${ly}" text-anchor="end" class="dim" font-size="${g.small}">${p}</text></g>`;
    })
    .join('\n');
  const rows = Math.ceil(c.langs.length / cols);
  const h = up(legendY + (rows - 1) * rowStep + (g.phone ? 26 : 30));

  const body = `${sectionTop(g, 'linguist --breakdown', `# bytes of code in ${scope(c)}`)}
<rect x="${g.left}" y="${barY}" width="${W}" height="${barH}" rx="${barH / 2}" fill="${t.panel}"/>
<g clip-path="url(#bar)">${segments}</g>
${items}`;
  const defs = `<clipPath id="bar"><rect x="${g.left}" y="${barY}" width="${W}" height="${barH}" rx="${barH / 2}"/></clipPath>`;
  return slice(g, h, body, { title: languagesAlt(c), defs });
}
