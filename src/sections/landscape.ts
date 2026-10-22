// 贡献城市周围的景物：背后的草地和树，前面的滨海路和海。路上有来回的车，路边有路灯，海上有慢慢
// 开过的船，交通和两端的车站、灯塔见 transport.ts。坐标都按城市的等距投影算，和楼的透视一致；
// 树、草、花和浪花的位置用固定的种子生成，不随数据变。
// 颜色跟着时段和天气变：天黑或天气不好时车灯、路灯和船灯亮着，黎明和黄昏带上天边的颜色，坏天气发灰，
// 下雪时树梢和草地是白的。车船和列车从画外陆续进入，关掉动画时和飞机一样停在画外。
import type { Phase, Sky } from '../data.ts';
import { mix, r2, random, shade } from '../svg.ts';
import { theme as t } from '../theme.ts';
import { GRAY, weatherGray } from './scene.ts';
import { transport } from './transport.ts';

export type Pt = [number, number];

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
export const ROAD = { inner: 7.1, outer: 7.9, down: 7.32, up: 7.68, coast: 9.5 };

/** behind 是楼后的绿地、高架和车站，coast 是海和道路、轨道地面，traffic 按前后关系排列街道设施与车船 */
export type Landscape = { css: string; defs: string; behind: string; coast: string; traffic: string };

const pt = ([x, y]: Pt): string => `${r2(x)},${r2(y)}`;
const polygon = (list: Pt[], fill: string): string => `<polygon points="${list.map(pt).join(' ')}" fill="${fill}"/>`;
const lift = ([x, y]: Pt, z: number): Pt => [x, y - z];

/** 雪的颜色 */
const SNOW = '#cfd9e6';
const CARS = [t.bright, t.accent, t.red, t.yellow, t.cyan, '#9aa7b8'];

/**
 * 按时段和天气上色：白天偏亮；黎明和黄昏是偏紫的暮色里带一点天边的暖色（直接混橙色会发灰）；
 * 坏天气发灰。天黑或天气不好时开灯
 */
export type Painter = { paint: (c: string, f?: number) => string; phase: Phase; lights: boolean; snow: boolean };

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

/** 滨海路：路面、路缘和虚线；路边每隔四周一盏灯，灯杆和光晕单独交给前景绘制 */
function road(iso: Iso, P: Painter, G: Grid): { svg: string; fixtures: string } {
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
  return { svg: surface + curbs + middle, fixtures: glows.join('') + lamps };
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

/** 一条车道上的几辆车：从画外开始，用非负延迟错开入场；缓冲区也要容纳完整车灯光束 */
function lane(iso: Iso, G: Grid, P: Painter, v: number, ahead: boolean, seconds: number, cls: string, next: () => number): { svg: string; css: string } {
  const [ua, ub] = G.span(v);
  const [from, to] = ahead ? [ua - 3, ub + 3] : [ub + 3, ua - 3];
  const n = 3;
  const cars = Array.from({ length: n }, (_, i) => {
    const color = CARS[Math.floor(next() * CARS.length)] ?? t.bright;
    const jitter = next() * 0.6;
    const delay = (seconds * (i + (i === 0 ? 0 : jitter))) / n;
    return `<g class="${cls}" style="animation-delay:${delay.toFixed(2)}s">${car(iso, from, v, color, ahead, P.lights)}</g>`;
  });
  const d = to - from;
  return {
    svg: cars.join(''),
    css: `@keyframes z${cls}{to{transform:translate(${r2(G.eu[0] * d)}px,${r2(G.eu[1] * d)}px)}}
.${cls}{animation:z${cls} ${seconds}s linear infinite both}`,
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
  const network = transport(iso, P);
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
    network.css,
  ];
  return {
    css: css.join('\n'),
    defs: defs.join('\n'),
    behind: `<g class="in" style="animation-delay:.3s" clip-path="url(#frame)"><g mask="url(#land)">${network.back}${park(iso, P)}${network.landmarks}</g></g>`,
    coast: `<g class="in" style="animation-delay:.25s"><g mask="url(#land)">${waters.svg}${street.svg}${network.shore}</g></g>`,
    // 沿 v 从城市一侧往海上画：汽车、路灯、站棚、电车、接触网杆、码头、船。
    // 站棚和灯杆有高度，若与地面一起提前画，会被后画的汽车、电车错误覆盖。
    traffic: `<g mask="url(#land)"><g data-layer="cars">${down.svg}${up.svg}</g><g data-layer="street-lamps">${street.fixtures}</g>${network.platforms}${network.tram}${network.overhead}${network.harbor}${network.boats}</g>`,
  };
}
