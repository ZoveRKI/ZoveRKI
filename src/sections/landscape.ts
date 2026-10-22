// 贡献城市周围的景物：背后的草地和树，前面的滨海路和海。路上有来回的车，路边有路灯，海上有慢慢
// 开过的船。坐标都按城市的等距投影算，和楼的透视一致；树、草、花和浪花的位置用固定的种子生成，不随数据变。
// 颜色跟着时段和天气变：天黑或天气不好时车灯、路灯和船灯亮着，黎明和黄昏带上天边的颜色，坏天气发灰，
// 下雪时树梢和草地是白的。车和船在关掉动画时停在画面外面，和飞机一样看不见。
import type { Phase, Sky } from '../data.ts';
import { mix, r2, random, shade } from '../svg.ts';
import { theme as t } from '../theme.ts';
import { GRAY, weatherGray } from './scene.ts';

type Pt = [number, number];

/** 城市的等距投影和画面范围，由 contributions.ts 给出 */
export type Iso = {
  /** 地面坐标 (u, v) 和高度 z 在切片里的位置：u 沿着周往右下，v 沿着星期往左下 */
  xy: (u: number, v: number, z?: number) => Pt;
  /** 城市有几周，也就是 u 的范围 */
  weeks: number;
  /** 缩放：桌面版是 1，手机版小一些 */
  k: number;
  /** 画面范围：左右到窗口的边框，上下是城市的顶和底 */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
};

/** 城市前面（v 大于 7）的滨海路：路面的内外两边，往右下和往左上的两条车道，以及海岸线 */
export const ROAD = { inner: 7.1, outer: 7.9, down: 7.32, up: 7.68, coast: 8 };

/** 船走的航线离岸多远 */
const SEA_LANE = 12.6;

/** behind 画在楼的后面（草地和树），coast 画在楼之前（海、浪花、海岸线、路、路灯），traffic 画在楼之后（车、船） */
export type Landscape = { css: string; defs: string; behind: string; coast: string; traffic: string };

const pt = ([x, y]: Pt): string => `${r2(x)},${r2(y)}`;
const polygon = (list: Pt[], fill: string): string => `<polygon points="${list.map(pt).join(' ')}" fill="${fill}"/>`;
const lerp = (a: Pt, b: Pt, f: number): Pt => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
const lift = ([x, y]: Pt, z: number): Pt => [x, y - z];

/** 雪的颜色 */
const SNOW = '#cfd9e6';
const CARS = [t.bright, t.accent, t.red, t.yellow, t.cyan, '#9aa7b8'];

/**
 * 按时段和天气上色：白天偏亮；黎明和黄昏是偏紫的暮色里带一点天边的暖色（直接混橙色会发灰）；
 * 坏天气发灰。天黑或天气不好时开灯
 */
type Painter = { paint: (c: string, f?: number) => string; phase: Phase; lights: boolean; snow: boolean };

function painter(sky: Sky | null): Painter {
  const phase = sky?.phase ?? 'night';
  const gray = weatherGray(sky?.weather ?? null);
  const toward = {
    night: null,
    dawn: mix(t.sky.violet, t.sky.dawn, 0.35),
    day: t.sky.day,
    dusk: mix(t.sky.violet, t.sky.dusk, 0.25),
  }[phase];
  const amount = { night: 0, dawn: 0.16, day: 0.2, dusk: 0.2 }[phase];
  return {
    paint: (c, f = 1) => {
      const tinted = toward ? mix(c, toward, amount * f) : c;
      return gray ? mix(tinted, GRAY, gray * 0.35) : tinted;
    },
    phase,
    lights: phase !== 'day' || gray >= 0.5,
    snow: sky?.weather === 'snow',
  };
}

/** 投影的反算：画面四个角落在地面上的 u、v 范围，以及一条 v 不变的线从窗口左边进来、到画面底边出去时的 u */
function grid(iso: Iso) {
  const O = iso.xy(0, 0);
  const U = iso.xy(1, 0);
  const V = iso.xy(0, 1);
  const eu: Pt = [U[0] - O[0], U[1] - O[1]];
  const ev: Pt = [V[0] - O[0], V[1] - O[1]];
  const det = eu[0] * ev[1] - eu[1] * ev[0];
  const uv = (x: number, y: number): Pt => {
    const [dx, dy] = [x - O[0], y - O[1]];
    return [(dx * ev[1] - dy * ev[0]) / det, (eu[0] * dy - eu[1] * dx) / det];
  };
  const corners = [uv(iso.x0, iso.y0), uv(iso.x1, iso.y0), uv(iso.x1, iso.y1), uv(iso.x0, iso.y1)];
  const span = (v: number): Pt => {
    const [x, y] = iso.xy(0, v);
    return [(iso.x0 - x) / eu[0], (iso.y1 - y) / eu[1]];
  };
  return {
    eu,
    u0: Math.min(...corners.map(([u]) => u)),
    u1: Math.max(...corners.map(([u]) => u)),
    v1: Math.max(...corners.map(([, v]) => v)),
    span,
  };
}
type Grid = ReturnType<typeof grid>;

/** 一棵树：两色的尖顶针叶树或者圆顶树；(x, y) 是树根，s 是大小，下雪时树梢发白 */
function tree(x: number, y: number, s: number, round: boolean, [lit, dark]: [string, string], P: Painter): string {
  const base = y - 2 * s;
  let svg = `<path d="M${r2(x)} ${r2(y)}V${r2(base)}" stroke="${P.paint(t.land.trunk)}" stroke-width="${r2(1.1 * s)}"/>`;
  if (round) {
    const r = 3.6 * s;
    const cy = base - r * 0.8;
    svg += `<circle cx="${r2(x)}" cy="${r2(cy)}" r="${r2(r)}" fill="${dark}"/><circle cx="${r2(x - r * 0.3)}" cy="${r2(cy - r * 0.25)}" r="${r2(r * 0.68)}" fill="${lit}"/>`;
    if (P.snow) svg += `<ellipse cx="${r2(x)}" cy="${r2(cy - r * 0.62)}" rx="${r2(r * 0.62)}" ry="${r2(r * 0.34)}" fill="${P.paint(SNOW)}"/>`;
  } else {
    const [w, top] = [3.2 * s, base - 10 * s];
    svg += polygon([[x - w, base], [x, top], [x, base]], lit) + polygon([[x, base], [x, top], [x + w, base]], dark);
    if (P.snow) svg += polygon([[x - w * 0.36, top + 3.6 * s], [x, top], [x + w * 0.36, top + 3.6 * s]], P.paint(SNOW));
  }
  return svg;
}

/** 点缀在草地上的小花：夜里暗一些，下雪时没有 */
function flowers(spots: Pt[], s: number, P: Painter, next: () => number): string {
  if (P.snow || !spots.length) return '';
  const dots = spots.map(([x, y]) => {
    const color = t.land.flowers[Math.floor(next() * t.land.flowers.length)] ?? t.bright;
    return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2((0.6 + next() * 0.5) * s)}" fill="${P.paint(color, 0.5)}"/>`;
  });
  return `<g opacity="${{ night: 0.45, dawn: 0.65, day: 0.9, dusk: 0.6 }[P.phase]}">${dots.join('')}</g>`;
}

/** 城市背后的一条草地：一簇簇小草、零星的小花和一排树（七成尖顶，三成圆顶），从远往近画 */
function park(iso: Iso, P: Painter): string {
  const { xy, weeks, k } = iso;
  const next = random('trees');
  const [u0, u1] = [-1.2, weeks + 8];
  const color = P.paint(P.snow ? mix(t.land.park, SNOW, 0.18) : t.land.park);
  const ground = polygon([xy(u0, -2.3), xy(u1, -2.3), xy(u1, -0.05), xy(u0, -0.05)], color);
  const tufts: string[] = [];
  const spots: Pt[] = [];
  for (let u = u0 + 0.5; u < u1; u += 0.5 + next() * 0.7) {
    const [x, y] = xy(u, -2.1 + next() * 1.9);
    const s = (0.8 + next() * 0.5) * k;
    if (next() < 0.55) tufts.push(`M${r2(x - s)} ${r2(y)}l${r2(-0.6 * s)} ${r2(-2.4 * s)}M${r2(x)} ${r2(y)}v${r2(-3 * s)}M${r2(x + s)} ${r2(y)}l${r2(0.6 * s)} ${r2(-2.4 * s)}`);
    else spots.push([x, y - s]);
  }
  const grass = P.snow
    ? ''
    : `<path d="${tufts.join('')}" fill="none" stroke="${P.paint(t.land.grass)}" stroke-width="${r2(0.7 * k)}" stroke-linecap="round" opacity=".7"/>`;
  const trees = t.land.tree.map((c) => P.paint(c)) as [string, string];
  const list = Array.from({ length: Math.round((u1 - u0) * (0.5 + 0.45 * k)) }, () => ({
    u: u0 + 0.4 + next() * (u1 - u0 - 0.8),
    v: -2.05 + next() * 1.7,
    s: (0.75 + next() * 0.55) * k,
    round: next() < 0.3,
  })).sort((a, b) => a.u + a.v - (b.u + b.v));
  const items = list.map(({ u, v, s, round }) => tree(...xy(u, v), s, round, trees, P));
  return ground + grass + flowers(spots, k, P, next) + items.join('');
}

/** 海：渐变从靠岸处（映着城市的灯光）到远处变深，上面撒着三组轮流闪的浪花，岸边一条发光的海岸线 */
function sea(iso: Iso, P: Painter, G: Grid): { svg: string; defs: string } {
  const { xy, weeks, k } = iso;
  const c = ROAD.coast;
  const [ax, ay] = xy(weeks / 2, c);
  const [bx, by] = xy(weeks / 2, c + 12);
  const defs = `<linearGradient id="seaglow" gradientUnits="userSpaceOnUse" x1="${r2(ax)}" y1="${r2(ay)}" x2="${r2(bx)}" y2="${r2(by)}"><stop offset="0" stop-color="${P.paint(t.land.seaNear)}"/><stop offset="1" stop-color="${P.paint(t.land.seaFar, 0.6)}"/></linearGradient>`;
  const water = polygon([xy(G.u0, c), xy(G.u1, c), xy(G.u1, G.v1 + 1), xy(G.u0, G.v1 + 1)], 'url(#seaglow)');
  const next = random('waves');
  const marks: string[][] = [[], [], []];
  for (let i = 0; i < Math.round(80 * (0.4 + 0.6 * k)); i++) {
    const [u, v, len] = [G.u0 + next() * (G.u1 - G.u0), c + 0.6 + next() * (G.v1 - c), 0.25 + next() * 0.55];
    const [a, b] = [xy(u, v), xy(u + len, v)];
    if (a[0] < iso.x0 || b[0] > iso.x1 || b[1] > iso.y1 - 4) continue;
    marks[i % 3]?.push(`M${pt(a)}L${pt(b)}`);
  }
  const wave = P.paint(t.land.wave);
  const waves = marks
    .map((d, i) =>
      d.length
        ? `<path class="w${i}" d="${d.join('')}" fill="none" stroke="${wave}" stroke-width="${r2(Math.max(0.8, k))}" stroke-linecap="round" stroke-opacity="${[0.22, 0.3, 0.18][i]}"/>`
        : '',
    )
    .join('');
  const [ua, ub] = G.span(c);
  const shore = `M${pt(xy(ua, c))}L${pt(xy(ub, c))}`;
  const glow = `<path d="${shore}" fill="none" stroke="${t.accent}" stroke-width="3" opacity=".3" filter="url(#soft)"/><path d="${shore}" fill="none" stroke="${t.accent}" stroke-opacity=".45"/>`;
  return { svg: water + waves + glow, defs };
}

/** 滨海路：路面、两边的路缘、中间的虚线，以及海岸线上每隔四周一盏的路灯（开灯时有一圈光） */
function road(iso: Iso, P: Painter, G: Grid): { svg: string; glows: string } {
  const { xy, k } = iso;
  const surface = polygon(
    [xy(G.u0, ROAD.inner), xy(G.u1, ROAD.inner), xy(G.u1, ROAD.outer), xy(G.u0, ROAD.outer)],
    P.paint(t.land.road),
  );
  const line = (v: number): string => {
    const [ua, ub] = G.span(v);
    return `M${pt(xy(ua, v))}L${pt(xy(ub, v))}`;
  };
  const curbs = `<path d="${line(ROAD.inner)}${line(ROAD.outer)}" fill="none" stroke="${t.border}" stroke-width="${r2(0.8 * k)}" stroke-opacity=".7"/>`;
  const middle = `<path d="${line((ROAD.inner + ROAD.outer) / 2)}" fill="none" stroke="${P.paint(t.land.roadLine)}" stroke-width="${r2(Math.max(0.6, 0.8 * k))}" stroke-dasharray="${r2(6 * k)} ${r2(8 * k)}"/>`;
  const v = ROAD.outer + 0.06;
  const [ua, ub] = G.span(v);
  const poles: string[] = [];
  const heads: string[] = [];
  const glows: string[] = [];
  for (let u = Math.ceil(ua / 4) * 4 + 1; u < ub; u += 4) {
    const [x, y] = xy(u, v);
    if (x < iso.x0 + 4 || y > iso.y1 - 10 * k) continue;
    const top = y - 9 * k;
    poles.push(`M${r2(x)} ${r2(y)}V${r2(top)}`);
    heads.push(`<circle cx="${r2(x)}" cy="${r2(top)}" r="${r2(1.3 * k)}" fill="${P.lights ? t.land.lamp : t.faint}"/>`);
    if (P.lights) glows.push(`<circle cx="${r2(x)}" cy="${r2(top + 2 * k)}" r="${r2(11 * k)}" fill="url(#lampglow)"/>`);
  }
  const lamps = `<path d="${poles.join('')}" stroke="${t.faint}" stroke-width="${r2(0.9 * k)}"/>${heads.join('')}`;
  return { svg: surface + curbs + middle + lamps, glows: glows.join('') };
}

/** 一辆车：等距视角的小方块。往右下开的车看得到车头灯（天黑时照出一片光），往左上开的看得到尾灯 */
function car(iso: Iso, u: number, v: number, color: string, ahead: boolean, lights: boolean): string {
  const { xy, k } = iso;
  const [ua, ub, va, vb] = [u - 0.28, u + 0.28, v - 0.11, v + 0.11];
  const h = 3.2 * k;
  const [T, R, B, L] = [xy(ua, va), xy(ub, va), xy(ub, vb), xy(ua, vb)];
  const body = lights ? shade(color, 0.7) : color;
  let svg =
    polygon([L, B, lift(B, h), lift(L, h)], shade(body, 0.72)) +
    polygon([B, R, lift(R, h), lift(B, h)], shade(body, 0.5)) +
    polygon([T, R, B, L].map((p) => lift(p, h)), body);
  if (ahead && lights) {
    svg += polygon([xy(ub, va + 0.02), xy(ub + 1.4, va - 0.16), xy(ub + 1.4, vb + 0.16), xy(ub, vb - 0.02)], 'url(#beam)');
  }
  const lamp = ahead ? '#fff4d6' : '#ff4d5e';
  for (const vv of [va + 0.05, vb - 0.05]) {
    const [x, y] = xy(ub, vv, h * 0.45);
    svg += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(0.75 * k)}" fill="${lamp}"/>`;
  }
  return svg;
}

/** 一条车道上的几辆车：从窗口左边开到画面底边（或者反过来），用负的动画延迟错开 */
function lane(iso: Iso, G: Grid, P: Painter, v: number, ahead: boolean, seconds: number, cls: string, next: () => number): { svg: string; css: string } {
  const [ua, ub] = G.span(v);
  const [from, to] = ahead ? [ua - 1, ub + 1] : [ub + 1, ua - 1];
  const n = 3;
  const cars = Array.from({ length: n }, (_, i) => {
    const color = CARS[Math.floor(next() * CARS.length)] ?? t.bright;
    const delay = -(seconds * (i + next() * 0.6)) / n;
    return `<g class="${cls}" style="animation-delay:${delay.toFixed(2)}s">${car(iso, from, v, color, ahead, P.lights)}</g>`;
  });
  const d = to - from;
  return {
    svg: cars.join(''),
    css: `@keyframes z${cls}{to{transform:translate(${r2(G.eu[0] * d)}px,${r2(G.eu[1] * d)}px)}}
.${cls}{animation:z${cls} ${seconds}s linear infinite}`,
  };
}

/** 船：船身、红色的水线、甲板、船舱和桅杆，后面拖着两道尾迹；天黑时船舱的窗户和桅灯亮着。沿着海岸慢慢开过去，轻轻起伏 */
function boat(iso: Iso, G: Grid, P: Painter): { svg: string; css: string } {
  const { xy, k } = iso;
  const v = SEA_LANE;
  const [ua, ub] = G.span(v);
  const [from, to] = [ua - 3, ub + 3];
  const at = (du: number, dv: number, z = 0): Pt => xy(from + du, v + dv, z);
  const deck = 2.6 * k;
  const [S1, M1, Tip, M2, S2] = [at(-1, -0.3), at(0.45, -0.3), at(1.1, 0), at(0.45, 0.3), at(-1, 0.3)];
  const hull = P.paint(t.land.hull);
  const wake = `<path d="M${pt(at(-1, -0.3))}L${pt(at(-3.6, -0.95))}M${pt(at(-1, 0.3))}L${pt(at(-3.6, 0.95))}M${pt(at(-1, 0))}L${pt(at(-4.2, 0))}" fill="none" stroke="${P.paint(t.land.wave)}" stroke-width="${r2(0.8 * k)}" stroke-linecap="round" stroke-opacity=".3"/>`;
  let svg =
    wake +
    polygon([S2, M2, Tip, lift(Tip, deck), lift(M2, deck), lift(S2, deck)], hull) +
    polygon([S2, M2, Tip, lift(Tip, deck * 0.32), lift(M2, deck * 0.32), lift(S2, deck * 0.32)], shade(t.red, 0.75)) +
    polygon([Tip, M1, lift(M1, deck), lift(Tip, deck)], shade(hull, 0.8)) +
    polygon([S1, M1, Tip, M2, S2].map((p) => lift(p, deck)), P.paint(t.land.deck));
  // 船舱
  const cab = 4 * k;
  const [cT, cR, cB, cL] = [at(-0.75, -0.17, deck), at(-0.05, -0.17, deck), at(-0.05, 0.17, deck), at(-0.75, 0.17, deck)];
  const cabin = P.paint(t.land.cabin);
  svg +=
    polygon([cL, cB, lift(cB, cab), lift(cL, cab)], shade(cabin, 0.8)) +
    polygon([cB, cR, lift(cR, cab), lift(cB, cab)], shade(cabin, 0.6)) +
    polygon([cT, cR, cB, cL].map((p) => lift(p, cab)), cabin);
  const glass = P.lights ? t.land.lamp : shade(t.land.deck, 0.8);
  for (const s of [0.12, 0.42, 0.72]) {
    svg += polygon([lerp(cL, cB, s), lerp(cL, cB, s + 0.16), lift(lerp(cL, cB, s + 0.16), cab * 0.55), lift(lerp(cL, cB, s), cab * 0.55)].map((p) => lift(p, cab * 0.2)), glass);
  }
  // 桅杆和桅灯
  const [mx, my] = lift(lerp(cT, cB, 0.5), cab);
  svg += `<path d="M${r2(mx)} ${r2(my)}V${r2(my - 7 * k)}" stroke="${t.dim}" stroke-width="${r2(0.8 * k)}"/><circle cx="${r2(mx)}" cy="${r2(my - 7 * k)}" r="${r2(1.1 * k)}" fill="${P.lights ? t.bright : t.faint}"/>`;
  if (P.lights) {
    const [rx, ry] = lift(lerp(M2, Tip, 0.5), deck * 0.7);
    svg += `<circle cx="${r2(rx)}" cy="${r2(ry)}" r="${r2(0.8 * k)}" fill="#ff4d5e"/>`;
  }
  const d = to - from;
  return {
    // 动画先走了三成，打开页面时船已经在海上
    svg: `<g class="boat" style="animation-delay:-28s"><g class="bob">${svg}</g></g>`,
    css: `@keyframes zsail{to{transform:translate(${r2(G.eu[0] * d)}px,${r2(G.eu[1] * d)}px)}}
@keyframes zbob{50%{transform:translateY(${r2(-0.8 * k)}px)}}
.boat{animation:zsail 90s linear infinite}.bob{animation:zbob 3.2s ease-in-out infinite}`,
  };
}

/** 城市周围的景物。sky 是 null（没有配置所在地）时按没有天气的夜晚画 */
export function landscape(iso: Iso, sky: Sky | null): Landscape {
  const P = painter(sky);
  const G = grid(iso);
  const { k } = iso;
  const h = r2(iso.y1 - iso.y0);
  const box = `x="${iso.x0}" y="${r2(iso.y0)}" width="${r2(iso.x1 - iso.x0)}" height="${h}"`;
  const waters = sea(iso, P, G);
  const street = road(iso, P, G);
  const next = random('cars');
  const down = lane(iso, G, P, ROAD.down, true, 24, 'ca', next);
  const up = lane(iso, G, P, ROAD.up, false, 30, 'cb', next);
  const ship = boat(iso, G, P);
  const defs = [
    waters.defs,
    // 画面底边淡出，窗口左右两边截齐
    `<linearGradient id="landfade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="${r2(1 - (24 * k) / h)}" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>`,
    `<mask id="land" maskUnits="userSpaceOnUse" ${box}><rect ${box} fill="url(#landfade)"/></mask>`,
    `<linearGradient id="beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${t.land.lamp}" stop-opacity=".45"/><stop offset="1" stop-color="${t.land.lamp}" stop-opacity="0"/></linearGradient>`,
    `<radialGradient id="lampglow"><stop offset="0" stop-color="${t.land.lamp}" stop-opacity=".28"/><stop offset="1" stop-color="${t.land.lamp}" stop-opacity="0"/></radialGradient>`,
  ];
  const css = [
    `@keyframes zwave{0%,100%{opacity:.3}50%{opacity:1}}
.w0{animation:zwave 4s ease-in-out infinite}.w1{animation:zwave 5.5s ease-in-out 1.5s infinite}.w2{animation:zwave 7s ease-in-out 3s infinite}`,
    down.css,
    up.css,
    ship.css,
  ];
  return {
    css: css.join('\n'),
    defs: defs.join('\n'),
    behind: `<g class="in" style="animation-delay:.3s" clip-path="url(#frame)">${park(iso, P)}</g>`,
    coast: `<g class="in" style="animation-delay:.25s"><g mask="url(#land)">${waters.svg}${street.svg}${street.glows}</g></g>`,
    traffic: `<g mask="url(#land)">${down.svg}${up.svg}${ship.svg}</g>`,
  };
}
