// 终端窗口的外框。每张切片都画左右边框，只有第一张画顶边、最后一张画底边，
// 一张张图上下拼起来就是一个完整的窗口。
import { fontFaces } from './font.ts';
import { delay, esc, r2, textWidth, visibleText } from './svg.ts';
import { type Geo, theme as t, UNIT } from './theme.ts';

/** 一张 SVG 的公共部分 */
type Doc = {
  /** 图片标题，读屏软件会读出来 */
  title: string;
  css?: string;
  defs?: string;
};

function baseCss(g: Geo): string {
  return `svg{font-family:ZMono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:${g.fs}px;fill:${t.fg};font-variant-ligatures:none}
.dim{fill:${t.dim}}.faint{fill:${t.faint}}.ac{fill:${t.accent}}.ac2{fill:${t.accent2}}.ok{fill:${t.green}}.hi{fill:${t.bright}}
@keyframes zin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes zblink{50%{opacity:0}}
@keyframes zrise{from{transform:scaleY(0)}}
@keyframes zgrow{from{transform:scaleX(0)}}
.in{animation:zin .6s cubic-bezier(.2,.7,.2,1) both}
.cursor{animation:zblink 1.1s steps(1) infinite}
.rise{transform-box:fill-box;transform-origin:50% 100%;animation:zrise .8s cubic-bezier(.2,.8,.2,1) both}
.grow{transform-box:fill-box;transform-origin:0 50%;animation:zgrow .9s cubic-bezier(.2,.8,.2,1) both}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;
}

async function document(
  g: Geo,
  w: number,
  h: number,
  parts: { under: string; body: string; over: string },
  d: Doc,
  gridX = 0,
): Promise<string> {
  const faces = await fontFaces(visibleText(parts.body), parts.body.includes('font-weight="700"'));
  const W = r2(w);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(d.title)}">
<title>${esc(d.title)}</title>
<style>
${faces}
${baseCss(g)}${d.css ? `\n${d.css}` : ''}
</style>
<defs>
<filter id="glow" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${h}"><feGaussianBlur stdDeviation="${g.phone ? 5 : 7}"/></filter>
<filter id="soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="${g.phone ? 3 : 4.5}"/></filter>
<pattern id="dots" x="${r2(gridX)}" y="0" width="${UNIT}" height="${UNIT}" patternUnits="userSpaceOnUse"><circle cx="${UNIT / 2}" cy="${UNIT / 2}" r="1" fill="${t.faint}" fill-opacity=".3"/></pattern>${d.defs ? `\n${d.defs}` : ''}
</defs>
${parts.under}
${parts.body}
${parts.over}
</svg>
`;
}

function checkHeight(h: number): void {
  if (h % UNIT) throw new Error(`切片高度 ${h} 不是 ${UNIT} 的倍数，背景点阵会错位`);
}

type Edges = { top: boolean; bottom: boolean };

/** 窗口的外轮廓（闭合路径，用来填充背景） */
function outline(x0: number, x1: number, y0: number, y1: number, r: number, e: Edges): string {
  const top = e.top
    ? `M${x0} ${y0 + r}A${r} ${r} 0 0 1 ${x0 + r} ${y0}H${x1 - r}A${r} ${r} 0 0 1 ${x1} ${y0 + r}`
    : `M${x0} ${y0}H${x1}`;
  const bottom = e.bottom ? `V${y1 - r}A${r} ${r} 0 0 1 ${x1 - r} ${y1}H${x0 + r}A${r} ${r} 0 0 1 ${x0} ${y1 - r}` : `V${y1}H${x0}`;
  return `${top}${bottom}Z`;
}

/**
 * 窗口的边框，接着别的切片的一侧不封口。
 * ext 把不封口一侧的左右边延长到图片外面，模糊出来的光晕在接缝处才连贯。
 */
function border(x0: number, x1: number, y0: number, y1: number, r: number, e: Edges, ext = 0): string {
  const ya = e.top ? y0 + r : y0 - ext;
  const yb = e.bottom ? y1 - r : y1 + ext;
  let d = `M${x0} ${yb}V${ya}`;
  d += e.top ? `A${r} ${r} 0 0 1 ${x0 + r} ${y0}H${x1 - r}A${r} ${r} 0 0 1 ${x1} ${y0 + r}` : `M${x1} ${ya}`;
  d += `V${yb}`;
  if (e.bottom) d += `A${r} ${r} 0 0 1 ${x1 - r} ${y1}H${x0 + r}A${r} ${r} 0 0 1 ${x0} ${y1 - r}`;
  return d;
}

export type SliceOpts = Doc & { top?: boolean; bottom?: boolean };

/** 占满一整行的切片 */
export async function slice(g: Geo, h: number, body: string, o: SliceOpts): Promise<string> {
  checkHeight(h);
  const e: Edges = { top: !!o.top, bottom: !!o.bottom };
  const y0 = e.top ? g.m : 0;
  const y1 = e.bottom ? h - g.m : h;
  const shape = outline(g.x0, g.x1, y0, y1, g.r, e);
  const under = `<path d="${border(g.x0, g.x1, y0, y1, g.r, e, 40)}" fill="none" stroke="${t.accent}" stroke-width="2" opacity=".45" filter="url(#glow)"/>
<path d="${shape}" fill="${t.bg}"/>
<path d="${shape}" fill="url(#dots)"/>`;
  const over = `<path d="${border(g.x0, g.x1, y0, y1, g.r, e)}" fill="none" stroke="${t.border}"/>`;
  return document(g, g.w, h, { under, body, over }, o);
}

/** 一行均分成 n 段时的第 k 段（比如链接按钮），只有最左和最右两段画边框 */
export async function segment(g: Geo, k: number, n: number, h: number, body: string, o: Doc): Promise<string> {
  checkHeight(h);
  const sw = g.w / n;
  const off = sw * k;
  const x0 = g.x0 - off;
  const x1 = g.x1 - off;
  const sides = [...(k === 0 ? [x0] : []), ...(k === n - 1 ? [x1] : [])];
  const bx0 = k === 0 ? x0 : 0;
  const bx1 = k === n - 1 ? x1 : sw;
  const box = `x="${r2(bx0)}" y="0" width="${r2(bx1 - bx0)}" height="${h}"`;
  const glow = sides.map((x) => `M${r2(x)} -40V${h + 40}`).join('');
  const rails = sides.map((x) => `M${r2(x)} 0V${h}`).join('');
  const under = `${glow ? `<path d="${glow}" fill="none" stroke="${t.accent}" stroke-width="2" opacity=".45" filter="url(#glow)"/>\n` : ''}<rect ${box} fill="${t.bg}"/>
<rect ${box} fill="url(#dots)"/>`;
  const over = rails ? `<path d="${rails}" fill="none" stroke="${t.border}"/>` : '';
  return document(g, sw, h, { under, body, over }, o, ((-off % UNIT) + UNIT) % UNIT);
}

/** 板块开头的命令行：左边是 `$ 命令`，右边是灰色注释（放不下就省略），下面一条虚线 */
export function sectionTop(g: Geo, cmd: string, comment = ''): string {
  const y = g.top - 44;
  const room = g.right - g.left - textWidth(`$ ${cmd}`, g.fs) - 24;
  const note =
    comment && textWidth(comment, g.small) <= room
      ? `<text x="${g.right}" y="${y}" text-anchor="end" class="faint" font-size="${g.small}">${esc(comment)}</text>`
      : '';
  return `<g class="in" ${delay(0.1)}><text x="${g.left}" y="${y}"><tspan class="ok" font-weight="700">$</tspan> ${esc(cmd)}</text>${note}</g>
<line x1="${g.left}" y1="${y + 16}" x2="${g.right}" y2="${y + 16}" stroke="${t.line}" stroke-dasharray="2 4"/>`;
}

/** 面板的小标题：大写、拉开字距 */
export function label(g: Geo, x: number, y: number, s: string): string {
  return `<text x="${r2(x)}" y="${y}" class="faint" font-size="${g.small - 1}" letter-spacing="1.5">${esc(s.toUpperCase())}</text>`;
}

/** 五角星，中心在 (cx, cy) */
export function star(cx: number, cy: number, r: number, fill: string): string {
  const points = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 ? r * 0.45 : r;
    return `${r2(cx + d * Math.cos(a))},${r2(cy + d * Math.sin(a))}`;
  });
  return `<polygon points="${points.join(' ')}" fill="${fill}"/>`;
}

/** 分叉图标：上面两个圆点汇到下面一个，s 是图标高度 */
export function fork(cx: number, cy: number, s: number, color: string): string {
  const [l, r, top, bottom, mid, dot] = [cx - s * 0.4, cx + s * 0.4, cy - s * 0.38, cy + s * 0.38, cy + s * 0.05, s * 0.15];
  return `<g fill="none" stroke="${color}" stroke-width="1.3"><circle cx="${r2(l)}" cy="${r2(top)}" r="${r2(dot)}"/><circle cx="${r2(r)}" cy="${r2(top)}" r="${r2(dot)}"/><circle cx="${r2(cx)}" cy="${r2(bottom)}" r="${r2(dot)}"/><path d="M${r2(l)} ${r2(top + dot)}V${r2(mid - dot)}Q${r2(l)} ${r2(mid)} ${r2(cx)} ${r2(mid)}Q${r2(r)} ${r2(mid)} ${r2(r)} ${r2(mid - dot)}V${r2(top + dot)}M${r2(cx)} ${r2(mid)}V${r2(bottom - dot)}"/></g>`;
}

/** 右上方向的箭头，提示整张图可以点击；(x, y) 是左上角，s 是边长 */
export function arrow(x: number, y: number, s: number, color: string): string {
  return `<path d="M${r2(x)} ${r2(y + s)}L${r2(x + s)} ${r2(y)}M${r2(x + s * 0.3)} ${r2(y)}H${r2(x + s)}V${r2(y + s * 0.7)}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
}
