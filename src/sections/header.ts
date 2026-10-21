// 头部：最上面的状态栏、whoami 打字效果、发光的大标题和一句话简介，右边是 neofetch 风格的信息栏
import type { Ctx } from '../context.ts';
import { slice } from '../frame.ts';
import { accountAge } from '../metrics.ts';
import { ADVANCE, delay, esc, num, plural, r2, textWidth, truncate, wrap } from '../svg.ts';
import { type Geo, theme as t, up } from '../theme.ts';

/** 信息栏底部的色块，和 neofetch 一样展示终端配色 */
const PALETTE = [t.red, t.yellow, t.green, t.cyan, t.accent, t.accent2, t.dim, t.fg];
/** 桌面版信息栏的左边界 */
const INFO_X = 540;

const CSS = `@keyframes ztype{from{opacity:0}to{opacity:1}}
@keyframes zflick{0%,88%,92%,96%,100%{opacity:.5}90%{opacity:.15}94%{opacity:.3}}
@keyframes zpulse{50%{opacity:.35}}
.ty{animation:ztype .01s linear both}
.flicker{animation:zflick 7s 2s infinite}
.dot{animation:zpulse 2s ease-in-out infinite}`;

export const headerAlt = (c: Ctx): string => `${c.config.name}: ${c.config.tagline}`;

/** 信息栏里由数据生成的几项 */
const KEYS = ['uptime', 'repos', 'langs', 'contrib', 'streak'];

/** langs 一行：配置了 stack 时，放得下就全部显示，放不下只显示前三个；没配置时按代码量取前三 */
function langs(c: Ctx, fits: (s: string) => boolean): string {
  const { stack } = c.config;
  if (stack.length) {
    const all = stack.join(', ');
    return fits(all) ? all : stack.slice(0, 3).join(', ');
  }
  return c.langs
    .filter((l) => !l.other)
    .slice(0, 3)
    .map((l) => l.name)
    .join(', ');
}

/** 信息栏的条目：先是从数据算出来的，再接上配置里的 facts；fits 判断一个值能不能放进一行 */
function facts(c: Ctx, fits: (s: string) => boolean): [string, string][] {
  const out: [string, string][] = [];
  const u = c.s.user;
  if (u) {
    out.push(['uptime', accountAge(u.createdAt, c.s.asOf)]);
    out.push(['repos', `${num(u.publicRepos)} public${c.stars ? ` · ${plural(c.stars, 'star')}` : ''}`]);
  }
  const l = langs(c, fits);
  if (l) out.push(['langs', l]);
  if (c.days.length) {
    out.push(['contrib', `${num(c.total)} in the last year`]);
    out.push(['streak', `${plural(c.streak.current, 'day')} · best ${num(c.streak.longest)}`]);
  }
  return [...out, ...c.config.facts];
}

/** 最上面的状态栏：左边一段标签，右边是绿色呼吸灯和状态；放不下时右边只留第一段（比如 ONLINE） */
function statusBar(g: Geo, [left, right]: [string, string]): string {
  const { x0, x1, m: y0, bar } = g;
  const size = g.small - 1;
  const pad = g.phone ? 12 : 16;
  // 字距 1px，每个字符多占 1px
  const width = (s: string) => textWidth(s, size) + [...s].length;
  const room = x1 - x0 - pad * 2 - width(left) - 30;
  const shown = [right, right.split(' · ')[0] ?? ''].find((s) => width(s) <= room) ?? '';
  const ty = y0 + bar / 2 + 4;
  const dot = shown
    ? `<circle class="dot" cx="${r2(x1 - pad - width(shown) - 12)}" cy="${y0 + bar / 2}" r="4" fill="${t.green}"/><circle class="dot" cx="${r2(x1 - pad - width(shown) - 12)}" cy="${y0 + bar / 2}" r="4" fill="${t.green}" filter="url(#soft)"/>
<text x="${x1 - pad}" y="${ty}" letter-spacing="1" text-anchor="end" class="dim" font-size="${size}">${esc(shown)}</text>`
    : '';
  return `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${bar}" fill="${t.accent}" fill-opacity=".08"/>
<line x1="${x0}" y1="${y0 + bar}" x2="${x1}" y2="${y0 + bar}" stroke="${t.accent}" stroke-opacity=".5"/>
<text x="${x0 + pad}" y="${ty}" letter-spacing="1" class="ac" font-size="${size}">${esc(left)}</text>
${dot}`;
}

export async function header(g: Geo, c: Ctx): Promise<string> {
  const { name, tagline, host } = c.config;
  const leftW = (g.phone ? g.right : INFO_X - 40) - g.left;
  // 大标题后面还跟着一个光标；名字太长时缩小字号
  const nameSize = Math.min(g.phone ? 44 : 64, Math.floor(leftW / (textWidth(name, 1) + ADVANCE)));
  const tagSize = g.phone ? 14 : 16;
  const tagStep = tagSize + 8;
  const tagLines = wrap(tagline, tagSize, leftW);

  const whoY = g.m + g.bar + (g.phone ? 38 : 52);
  const nameY = whoY + Math.round(nameSize * 1.1);
  const tagY = nameY + (g.phone ? 32 : 42);
  const tagEnd = tagY + (tagLines.length - 1) * tagStep;

  // 信息栏：键名一列的宽度按最长的键名算，剩下的是值的宽度
  const infoX = g.phone ? g.left : INFO_X;
  const keys = [...KEYS, ...c.config.facts.map(([k]) => k)];
  const keyW = Math.max(...keys.map((k) => textWidth(k, g.small))) + g.small * ADVANCE * 2;
  const room = g.right - infoX - keyW;
  const rows = facts(c, (s) => textWidth(s, g.small) <= room);
  const infoY = g.phone ? tagEnd + 44 : whoY;
  const rowStep = g.phone ? 21 : 22;
  const rowsTop = infoY + (g.phone ? 28 : 32);
  const paletteY = rowsTop + rows.length * rowStep - (g.phone ? 8 : 6);
  const h = up(Math.max(tagEnd, paletteY + 10) + (g.phone ? 26 : 30));

  const cw = g.fs * ADVANCE;
  const typed = [...'whoami']
    .map((ch, i) => `<text x="${r2(g.left + (i + 2) * cw)}" y="${whoY}" class="ty" ${delay(0.3 + i * 0.08)}>${ch}</text>`)
    .join('');
  const nameW = textWidth(name, nameSize);
  const [user = host, at = ''] = host.split('@');
  const sw = g.phone ? 14 : 16;

  const body = `${statusBar(g, c.config.status)}
<text x="${g.left}" y="${whoY}" class="ok" font-weight="700">$</text>${typed}
<g class="in" ${delay(0.95)}>
<text x="${g.left}" y="${nameY}" font-size="${nameSize}" font-weight="700" fill="${t.accent}" opacity=".5" filter="url(#soft)" class="flicker">${esc(name)}</text>
<text x="${g.left}" y="${nameY}" font-size="${nameSize}" font-weight="700" fill="url(#name)" mask="url(#scan)">${esc(name)}</text>
<rect x="${r2(g.left + nameW + nameSize * 0.12)}" y="${r2(nameY - nameSize * 0.72)}" width="${r2(nameSize * 0.42)}" height="${r2(nameSize * 0.8)}" fill="${t.accent}" opacity=".85" class="cursor"/>
</g>
<g class="in" ${delay(1.15)}>${tagLines.map((line, i) => `<text x="${g.left}" y="${tagY + i * tagStep}" font-size="${tagSize}">${esc(line)}</text>`).join('')}</g>
<g class="in" ${delay(1.25)}>
<text x="${infoX}" y="${infoY}" font-weight="700"><tspan class="ac">${esc(user)}</tspan>${at ? `<tspan class="faint">@</tspan><tspan class="ac2">${esc(at)}</tspan>` : ''}</text>
<line x1="${infoX}" y1="${infoY + 10}" x2="${r2(infoX + textWidth(host, g.fs))}" y2="${infoY + 10}" stroke="${t.faint}" stroke-dasharray="4 3"/>
</g>
${rows
  .map(
    ([k, v], i) =>
      `<g class="in" ${delay(1.35 + i * 0.08)}><text x="${infoX}" y="${rowsTop + i * rowStep}" font-size="${g.small}"><tspan class="ac2" font-weight="700">${esc(k)}</tspan><tspan x="${r2(infoX + keyW)}">${esc(truncate(v, g.small, room))}</tspan></text></g>`,
  )
  .join('\n')}
<g class="in" ${delay(1.4 + rows.length * 0.08)}>${PALETTE.map((fill, i) => `<rect x="${infoX + i * (sw + 4)}" y="${paletteY}" width="${sw}" height="${g.phone ? 8 : 10}" rx="2" fill="${fill}"/>`).join('')}</g>`;

  const defs = `<linearGradient id="name" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${t.accent}"/><stop offset=".6" stop-color="${t.accent2}"/><stop offset="1" stop-color="${t.cyan}"/></linearGradient>
<pattern id="scanlines" width="8" height="4" patternUnits="userSpaceOnUse"><rect width="8" height="3" fill="#fff"/><rect y="3" width="8" height="1" fill="#fff" fill-opacity=".5"/></pattern>
<mask id="scan" maskUnits="userSpaceOnUse" x="0" y="0" width="${g.w}" height="${h}"><rect width="${g.w}" height="${h}" fill="url(#scanlines)"/></mask>`;

  return slice(g, h, body, { title: headerAlt(c), top: true, css: CSS, defs });
}
