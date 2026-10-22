// 贡献城市的交通：后方高架上的高铁、海滨路外侧的电车，以及各走一条航线的船。
// 车站和海滨广场收住城市的两端；全部使用城市的地面坐标，不占用任何一天的贡献地块。
import { r2, shade } from '../svg.ts';
import { theme as t } from '../theme.ts';
import type { Iso, Painter, Pt } from './landscape.ts';

type Drawing = { svg: string; css: string };
type At = (u: number, v: number, z?: number) => Pt;

/** 两条铁路各占一条独立走廊，高度随手机版的比例缩放 */
export const RAIL = { express: -3.8, tram: 8.65, viaduct: 11 };

const pt = ([x, y]: Pt): string => `${r2(x)},${r2(y)}`;
const polygon = (list: Pt[], fill: string): string => `<polygon points="${list.map(pt).join(' ')}" fill="${fill}"/>`;
const line = (list: Pt[], color: string, width: number, extra = ''): string =>
  `<path d="M${list.map(pt).join('L')}" fill="none" stroke="${color}" stroke-width="${r2(width)}"${extra}/>`;

/** 等距长方体；z 是底部高度，h 是厚度，既能画车厢也能画站台 */
function box(at: At, u0: number, u1: number, v0: number, v1: number, z: number, h: number, color: string): string {
  const base = [at(u0, v0, z), at(u1, v0, z), at(u1, v1, z), at(u0, v1, z)];
  const top = base.map(([x, y]): Pt => [x, y - h]);
  const cy = base.reduce((sum, p) => sum + p[1], 0) / 4;
  // 船会反向航行，不能始终画局部 u/v 的正面：只画投影中朝向观众的两面。
  const walls = base.map((a, i) => {
    const j = (i + 1) % 4;
    const b = base[j]!;
    if ((a[1] + b[1]) / 2 <= cy) return '';
    return polygon([a, b, top[j]!, top[i]!], shade(color, (b[0] - a[0]) * (b[1] - a[1]) > 0 ? 0.7 : 0.48));
  });
  return walls.join('') + polygon(top, color);
}

/** 固定 v 的轨迹和四条画面边界相交的位置。高架要考虑高度，不能只算左边和底边 */
function span(iso: Iso, v: number, z = 0): Pt {
  const [x, y] = iso.xy(0, v, z);
  const [ux, uy] = iso.xy(1, v, z);
  return [Math.max((iso.x0 - x) / (ux - x), (iso.y0 - y) / (uy - y)), Math.min((iso.x1 - x) / (ux - x), (iso.y1 - y) / (uy - y))];
}

/** 相对一个画面内的静止位置运动；关闭动画后，列车仍在轨道上 */
function travel(iso: Iso, v: number, z: number, from: number, to: number, rest: number, name: string, seconds: number, shuttle = false): Drawing & { u: number } {
  const u = from + (to - from) * rest;
  const [x, y] = iso.xy(u, v, z);
  const move = (n: number): string => {
    const p = iso.xy(n, v, z);
    return `transform:translate(${r2(p[0] - x)}px,${r2(p[1] - y)}px)`;
  };
  const keys = shuttle ? `0%,6%,100%{${move(from)}}47%,53%{${move(to)}}94%{${move(from)}}` : `from{${move(from)}}to{${move(to)}}`;
  return {
    u,
    svg: `class="${name}" style="animation-delay:${r2(-seconds * (shuttle ? 0.06 + 0.41 * rest : rest))}s"`,
    css: `@keyframes z${name}{${keys}}\n.${name}{animation:z${name} ${seconds}s linear infinite}`,
  };
}

/** 两条钢轨和枕木，高架还有混凝土梁和桥墩 */
function track(iso: Iso, P: Painter, v: number, z: number, a: number, b: number, elevated: boolean): string {
  const { xy, k } = iso;
  let svg = '';
  if (elevated) {
    for (let u = Math.ceil(a / 5) * 5; u < b; u += 5) svg += box(xy, u - 0.12, u + 0.12, v - 0.16, v + 0.16, 0, z - 2 * k, P.paint(t.border));
  }
  svg += box(xy, a, b, v - 0.54, v + 0.54, z - 2 * k, 2 * k, P.paint(elevated ? '#35465b' : '#243445'));
  const ties: string[] = [];
  for (let u = Math.ceil(a * 1.5) / 1.5; u < b; u += 2 / 3) ties.push(`M${pt(xy(u, v - 0.36, z))}L${pt(xy(u, v + 0.36, z))}`);
  svg += `<path d="${ties.join('')}" stroke="${P.paint(t.faint)}" stroke-width="${r2(k)}" stroke-opacity=".55"/>`;
  for (const d of [-0.23, 0.23]) svg += line([xy(a, v + d, z), xy(b, v + d, z)], P.paint('#8598ae'), 0.65 * k);
  return svg;
}

/** 白色蓝腰线的流线高铁，或者有受电弓的薄荷绿双节电车 */
function train(iso: Iso, P: Painter, u: number, v: number, z: number, express: boolean): string {
  const { xy, k } = iso;
  const count = express ? 4 : 2;
  const length = express ? 1.55 : 1.25;
  const height = (express ? 6.2 : 7) * k;
  const color = P.paint(express ? '#d0dbe8' : '#70bfae');
  const glass = P.lights ? t.city.winOn : P.paint('#284359');
  let svg = '';
  for (let i = 0; i < count; i++) {
    const a = u + (i - count / 2) * (length + 0.12);
    const b = a + length;
    const front = express && i === count - 1;
    const back = express && i === 0;
    const low = z + 1.2 * k;
    for (const wheel of [a + 0.25, b - 0.25]) {
      const [x, y] = xy(wheel, v + 0.27, z + 0.8 * k);
      svg += `<ellipse cx="${r2(x)}" cy="${r2(y)}" rx="${r2(1.4 * k)}" ry="${r2(k)}" fill="${t.bg}"/>`;
    }
    const hull: Pt[] = [[a, -0.27], [b, -0.27], [b + (front ? 0.65 : 0), 0], [b, 0.27], [a, 0.27], [a - (back ? 0.45 : 0), 0]];
    const roof = hull.map(([du, dv]) => xy(du, v + dv, low + height * ((du > b || du < a) ? 0.3 : 1)));
    const base = hull.map(([du, dv]) => xy(du, v + dv, low));
    svg += polygon([base[4]!, base[3]!, base[2]!, roof[2]!, roof[3]!, roof[4]!], shade(color, 0.74));
    svg += polygon([base[2]!, base[1]!, roof[1]!, roof[2]!], shade(color, 0.55)) + polygon(roof, color);
    svg += polygon([xy(a, v + 0.275, low + 1.3 * k), xy(b, v + 0.275, low + 1.3 * k), xy(b, v + 0.275, low + 2.2 * k), xy(a, v + 0.275, low + 2.2 * k)], P.paint(express ? t.accent : '#d6e9d9'));
    for (let w = a + 0.18; w < b - 0.2; w += 0.38) {
      svg += polygon([xy(w, v + 0.28, low + 3 * k), xy(w + 0.23, v + 0.28, low + 3 * k), xy(w + 0.23, v + 0.28, low + 5 * k), xy(w, v + 0.28, low + 5 * k)], glass);
    }
    if (!express) {
      svg += box(xy, a + 0.3, b - 0.3, v - 0.16, v + 0.16, low + height, 1.3 * k, P.paint('#536775'));
      if (i === 0) svg += line([xy(a + 0.3, v, low + height + k), xy(a + 0.6, v, low + height + 4 * k), xy(a + 0.9, v, low + height + k)], t.dim, 0.8 * k);
    } else if (front) {
      svg += polygon([xy(b - 0.1, v - 0.2, low + height + 0.2 * k), xy(b + 0.24, v - 0.13, low + height * 0.7), xy(b + 0.24, v + 0.13, low + height * 0.7), xy(b - 0.1, v + 0.2, low + height + 0.2 * k)], P.paint('#284359'));
    }
  }
  return svg;
}

/** 小车站的玻璃雨棚、站厅和通往滨海路的台阶，用来补齐左上角 */
function station(iso: Iso, P: Painter): string {
  const { xy, k } = iso;
  const stone = P.paint(P.snow ? '#59697a' : '#24343e');
  let svg = polygon([xy(-8.4, -2.5), xy(-0.15, -2.5), xy(-0.15, 6.9), xy(-7.4, 6.9), xy(-8.4, 5)], stone);
  svg += box(xy, -7.7, -0.7, -3.2, -1.3, (RAIL.viaduct - 1) * k, 2 * k, P.paint('#516173'));
  svg += box(xy, -6.8, -1.1, -1.3, 1.2, 0, 12 * k, P.paint('#41566d'));
  for (let u = -6.5; u < -1.4; u += 0.85) {
    svg += polygon([xy(u, 1.21, 2 * k), xy(u + 0.57, 1.21, 2 * k), xy(u + 0.57, 1.21, 9 * k), xy(u, 1.21, 9 * k)], P.lights ? t.city.winOn : P.paint('#53798d'));
    svg += box(xy, u, u + 0.55, -1.1, 0.7, 12 * k, 0.7 * k, P.paint('#5787a5'));
  }
  for (const u of [-7.2, -4.4, -1.4]) svg += line([xy(u, -1.6, 12 * k), xy(u, -1.6, 22 * k)], t.dim, k);
  svg += box(xy, -7.8, -0.7, -3.15, -1.3, 22 * k, 1.5 * k, P.paint(P.snow ? '#bdceda' : '#376d93'));
  for (let u = -7.2; u < -1; u += 1.1) svg += line([xy(u, -3.15, 23.5 * k), xy(u, -1.3, 23.5 * k)], P.paint('#8fbcd1'), 0.6 * k);
  for (let i = 0; i < 5; i++) svg += box(xy, -4.8, -2.6, 1.3 + i * 0.55, 1.85 + i * 0.55, 0, (5 - i) * 0.9 * k, P.paint('#4a5a69'));
  // 站前花坛和一个小圆钟；使用形状，避免新增影响字体子集的装饰文字。
  svg += box(xy, -7, -5.8, 4.5, 5.5, 0, 2.8 * k, P.paint('#344f49'));
  svg += box(xy, -1.8, -0.7, 3.4, 4.8, 0, 2.8 * k, P.paint('#344f49'));
  const [x, y] = xy(-1.1, 2.2);
  svg += line([[x, y], [x, y - 18 * k]], t.dim, 1.3 * k);
  svg += `<circle cx="${r2(x)}" cy="${r2(y - 18 * k)}" r="${r2(3.4 * k)}" fill="${P.paint('#b5c9d6')}"/>`;
  svg += line([[x, y - 20.4 * k], [x, y - 18 * k], [x + 1.6 * k, y - 17.5 * k]], t.panel, 0.8 * k);
  return `<g data-landmark="station">${svg}</g>`;
}

/** 右端的低矮广场：步道、花池、长椅；高低错开，给 Mon/Fri 标签留出空位 */
function plaza(iso: Iso, P: Painter): string {
  const { xy, k, weeks: w } = iso;
  let svg = polygon([xy(w + 0.15, -0.05), xy(w + 6.4, -0.05), xy(w + 6.4, 7.7), xy(w + 4.3, 9.4), xy(w + 0.15, 9.4)], P.paint(P.snow ? '#455560' : '#203237'));
  for (const v of [3.2, 5.2, 7.2]) svg += line([xy(w + 0.3, v), xy(w + 6, v)], P.paint('#45515b'), 0.5 * k);
  svg += line([xy(w + 2.4, 0.2), xy(w + 2.4, 9.2)], P.paint('#53626d'), 0.6 * k);
  for (const [u, v] of [[w + 3.8, 2.8], [w + 4.9, 5.4]]) {
    svg += box(xy, u - 0.4, u + 0.4, v - 0.35, v + 0.35, 0, 3 * k, P.paint('#38564d'));
    const [x, y] = xy(u, v, 7 * k);
    svg += line([xy(u, v), [x, y]], t.land.trunk, k);
    svg += `<circle cx="${r2(x)}" cy="${r2(y - 2 * k)}" r="${r2(4.2 * k)}" fill="${P.paint(P.snow ? '#9cafb3' : t.land.tree[0])}"/>`;
  }
  for (const v of [4.1, 6.6]) svg += box(xy, w + 3.5, w + 5, v, v + 0.3, 2 * k, 1.2 * k, P.paint('#8b7560'));
  return `<g data-landmark="plaza">${svg}</g>`;
}

/** 海边的木栈桥和小灯塔，放在右侧广场的前沿 */
function harbor(iso: Iso, P: Painter): string {
  const { xy, k, weeks: w } = iso;
  let svg = box(xy, w + 1.1, w + 4.4, 9.4, 11.2, 0, 2.5 * k, P.paint('#5a5149'));
  for (let u = w + 1.3; u < w + 4.4; u += 0.4) svg += line([xy(u, 9.4, 2.6 * k), xy(u, 11.2, 2.6 * k)], P.paint('#9d8a70'), 0.5 * k);
  for (const u of [w + 1.2, w + 4.2]) svg += line([xy(u, 11.1, 2.5 * k), xy(u, 11.1, 6 * k)], t.dim, k);
  const pier = svg;
  svg = '';
  const u = w + 2.9;
  const v = 10.2;
  svg += box(xy, u - 0.65, u + 0.65, v - 0.65, v + 0.65, 0, 2.5 * k, P.paint('#4a5968'));
  svg += box(xy, u - 0.3, u + 0.3, v - 0.3, v + 0.3, 2.5 * k, 15 * k, P.paint('#b1c6d5'));
  svg += box(xy, u - 0.31, u + 0.31, v - 0.31, v + 0.31, 9 * k, 2.6 * k, P.paint('#ad5861'));
  svg += box(xy, u - 0.4, u + 0.4, v - 0.4, v + 0.4, 17.5 * k, 4 * k, P.paint('#27455d'));
  const [x, y] = xy(u, v, 19.5 * k);
  if (P.lights) svg += `<circle class="harbor-light" cx="${r2(x)}" cy="${r2(y)}" r="${r2(11 * k)}" fill="url(#lampglow)"/>`;
  svg += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(1.6 * k)}" fill="${P.lights ? t.land.lamp : t.sky.day}"/>`;
  svg += polygon([xy(u - 0.55, v + 0.55, 21.5 * k), xy(u + 0.55, v + 0.55, 21.5 * k), xy(u + 0.55, v - 0.55, 21.5 * k), xy(u, v, 25 * k), xy(u - 0.55, v - 0.55, 21.5 * k)], P.paint('#477ba1'));
  return `<g data-layer="harbor" data-landmark="harbor">${pier}<g data-landmark="lighthouse">${svg}</g></g>`;
}

type Vessel = { kind: 'ferry' | 'speedboat' | 'sailboat' | 'fishing'; lane: number; bend: number; drift: number; reverse: boolean; seconds: number; rest: number; color: string };

/** 从远到近排列的独立航道。弯度限制在各自走廊内，连船帆和完整尾迹的投影也不交叉 */
const FLEET: Vessel[] = [
  { kind: 'ferry', lane: 13.5, bend: 0.16, drift: 0.3, reverse: false, seconds: 104, rest: 0.48, color: t.red },
  { kind: 'fishing', lane: 17.5, bend: 0.18, drift: -0.3, reverse: true, seconds: 122, rest: 0.3, color: t.yellow },
  { kind: 'speedboat', lane: 21.8, bend: 0.22, drift: 0.6, reverse: true, seconds: 38, rest: 0.38, color: t.cyan },
  { kind: 'sailboat', lane: 26.8, bend: 0.12, drift: 0.4, reverse: false, seconds: 156, rest: 0.42, color: '#d0dbe8' },
  { kind: 'speedboat', lane: 31.3, bend: 0.18, drift: 0.4, reverse: false, seconds: 49, rest: 0.5, color: t.accent2 },
];

/** 船舷、甲板、船舱、帆和尾迹都在地面坐标中定向，桅杆始终竖直 */
function vessel(at: At, P: Painter, k: number, spec: Vessel): string {
  const fast = spec.kind === 'speedboat';
  const sail = spec.kind === 'sailboat';
  const length = fast ? 0.86 : spec.kind === 'ferry' ? 1.4 : 1.05;
  const width = fast ? 0.22 : 0.35;
  const deck = (fast ? 1.8 : 2.8) * k;
  const color = P.paint(spec.color);
  const wake = fast ? 5.6 : 3.4;
  let svg = line([at(-length, -width), at(-length - wake, -width - 0.7)], P.paint(t.land.wave), 0.7 * k, ' stroke-opacity=".32"');
  svg += line([at(-length, width), at(-length - wake, width + 0.7)], P.paint(t.land.wave), 0.7 * k, ' stroke-opacity=".32"');
  svg += line([at(-length - 0.2, 0), at(-length - wake * 0.8, 0)], P.paint(t.land.wave), (fast ? 1.2 : 0.7) * k, ' stroke-opacity=".36"');
  const hull: Pt[] = [at(-length, -width), at(length * 0.55, -width), at(length + 0.4, 0), at(length * 0.55, width), at(-length, width)];
  const top = hull.map(([x, y]): Pt => [x, y - deck]);
  for (const [i, a] of hull.entries()) {
    const j = (i + 1) % hull.length;
    const b = hull[j]!;
    if (b[0] >= a[0]) continue;
    svg += polygon([a, b, top[j]!, top[i]!], P.paint(t.land.hull)) + line([a, b], color, k);
  }
  svg += polygon(top, P.paint(fast || sail ? '#bacbd9' : t.land.deck));
  if (fast) {
    // 低矮的开放驾驶舱和斜风挡。
    svg += box(at, -0.3, 0.28, -0.15, 0.15, deck, 1.4 * k, shade(color, 0.7));
    svg += polygon([at(0.15, -0.18, deck), at(0.4, -0.18, deck + 3 * k), at(0.4, 0.18, deck + 3 * k), at(0.15, 0.18, deck)], P.paint('#446c88'));
    svg += polygon([at(-0.85, -0.2, deck + 0.2 * k), at(-0.4, -0.2, deck + 0.2 * k), at(-0.4, 0.2, deck + 0.2 * k), at(-0.85, 0.2, deck + 0.2 * k)], color);
  } else if (sail) {
    svg += box(at, -0.55, 0.2, -0.17, 0.17, deck, 2.5 * k, P.paint(t.land.cabin));
    svg += line([at(0, 0, deck), at(0, 0, deck + 23 * k)], t.dim, 0.8 * k);
    svg += polygon([at(0.04, 0, deck + 22 * k), at(0.04, 0, deck + 5 * k), at(1.25, 0.15, deck + 4 * k)], P.paint('#d0dbe8'));
    svg += polygon([at(-0.08, 0, deck + 19 * k), at(-0.08, 0, deck + 5 * k), at(-1, -0.14, deck + 4 * k)], P.paint('#7d9cb7'));
  } else {
    const cab = (spec.kind === 'ferry' ? 5.4 : 4) * k;
    svg += box(at, -length + 0.3, 0.25, -0.22, 0.22, deck, cab, P.paint(t.land.cabin));
    const side = at(0, 0.225)[1] > at(0, -0.225)[1] ? 0.225 : -0.225;
    for (let u = -length + 0.42; u < 0.1; u += 0.31) svg += polygon([at(u, side, deck + k), at(u + 0.18, side, deck + k), at(u + 0.18, side, deck + cab - k), at(u, side, deck + cab - k)], P.lights ? t.land.lamp : '#304d67');
    svg += line([at(-0.35, 0, deck + cab), at(-0.35, 0, deck + cab + 6 * k)], t.dim, 0.8 * k);
    if (spec.kind === 'fishing') {
      svg += box(at, 0.42, 0.75, -0.21, 0.15, deck, 1.8 * k, color);
      svg += line([at(0.3, -0.2, deck), at(0.3, -0.2, deck + 10 * k), at(1.1, -0.4, deck + 8 * k), at(1.1, -0.4, deck + 2 * k)], t.dim, 0.65 * k);
    }
  }
  if (P.lights) {
    const [x, y] = at(length * 0.65, width, deck + 0.5 * k);
    svg += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(0.8 * k)}" fill="${t.red}"/>`;
    const [mx, my] = at(-0.35, 0, deck + (sail ? 23 : fast ? 2 : spec.kind === 'ferry' ? 11.4 : 10) * k);
    svg += `<circle cx="${r2(mx)}" cy="${r2(my)}" r="${r2(0.75 * k)}" fill="${t.bright}"/>`;
  }
  return svg;
}

/** 将缓弯航线采样成 CSS 位移关键帧；SVG 作为 GitHub 的图片显示时同样能播放 */
function fleet(iso: Iso, P: Painter): Drawing {
  const css: string[] = [`@keyframes zbob{50%{transform:translateY(${r2(-0.65 * iso.k)}px)}}\n.bob{animation:zbob 3.8s ease-in-out infinite}`];
  const ships = FLEET.map((spec, i) => {
    const [a, b] = span(iso, spec.lane);
    // 最长的快艇尾迹也要完全离开窗口，循环重置才不会在边缘留下断掉的一小截。
    const [from, to] = spec.reverse ? [b + 8, a - 8] : [a - 8, b + 8];
    const route = (f: number): Pt => [from + (to - from) * f, spec.lane + spec.drift * (f - 0.5) + spec.bend * Math.sin(f * Math.PI * 2)];
    const [u, v] = route(spec.rest);
    const origin = iso.xy(u, v);
    const du = to - from;
    const dv = spec.drift + spec.bend * Math.PI * 2 * Math.cos(spec.rest * Math.PI * 2);
    const norm = Math.hypot(du, dv);
    const at: At = (x, y, z = 0) => iso.xy(u + (du * x - dv * y) / norm, v + (dv * x + du * y) / norm, z);
    const frames = Array.from({ length: 17 }, (_, j) => {
      const p = iso.xy(...route(j / 16));
      return `${j * 6.25}%{transform:translate(${r2(p[0] - origin[0])}px,${r2(p[1] - origin[1])}px)}`;
    });
    css.push(`@keyframes zsail${i}{${frames.join('')}}\n.sail${i}{animation:zsail${i} ${spec.seconds}s linear infinite}`);
    return `<g class="boat" data-vessel="${spec.kind}"><g class="sail${i}" style="animation-delay:${r2(-spec.rest * spec.seconds)}s"><g class="bob">${vessel(at, P, iso.k, spec)}</g></g></g>`;
  });
  return { svg: ships.join(''), css: css.join('\n') };
}

/** 拆开地面、站棚、车厢、接触网和码头，交给 landscape.ts 按前后关系组合 */
export function transport(iso: Iso, P: Painter): {
  css: string; back: string; landmarks: string; shore: string;
  platforms: string; tram: string; overhead: string; harbor: string; boats: string;
} {
  const { xy, k, weeks } = iso;
  const z = RAIL.viaduct * k;
  const [a, b] = span(iso, RAIL.express, z);
  const express = travel(iso, RAIL.express, z, a - 5, b + 5, 0.38, 'express', 34);
  const [ta, tb] = span(iso, RAIL.tram);
  const [from, to] = [Math.max(ta + 1.8, -2), Math.min(weeks + 1.3, tb - 2)];
  const tram = travel(iso, RAIL.tram, 0, from, to, 0.57, 'tram', 82, true);
  const ships = fleet(iso, P);
  let stops = '';
  for (const u of [from, to]) {
    stops += box(xy, u - 1.9, u + 1.8, 8.05, 8.3, 0, 2 * k, P.paint('#5b6c79'));
    stops += line([xy(u - 1.8, 8.29, 2.1 * k), xy(u + 1.7, 8.29, 2.1 * k)], P.paint(t.yellow), 0.75 * k);
    for (const du of [-1.3, 1.2]) stops += line([xy(u + du, 8.1, 2 * k), xy(u + du, 8.1, 8 * k)], t.dim, 0.7 * k);
    stops += box(xy, u - 1.5, u + 1.4, 7.98, 8.37, 8 * k, k, P.paint('#447e8a'));
  }
  // 接触网高度与受电弓顶部一致；杆子在电车临海一侧，必须在车厢之后绘制。
  let wire = line([xy(from - 3, RAIL.tram, 12.2 * k), xy(to + 3, RAIL.tram, 12.2 * k)], P.paint(t.dim), 0.55 * k, ' stroke-opacity=".55"');
  for (let u = Math.ceil((from - 2) / 10) * 10; u < to + 3; u += 10) {
    wire += line([xy(u, 9.15), xy(u, 9.15, 13.2 * k), xy(u, RAIL.tram, 12.2 * k)], P.paint(t.faint), 0.75 * k);
  }
  return {
    css: `${express.css}\n${tram.css}\n${ships.css}\n@keyframes zharbor{50%{opacity:.35}}\n.harbor-light{animation:zharbor 3.6s ease-in-out infinite}`,
    back: `<g data-rail="express">${track(iso, P, RAIL.express, z, a - 4, b + 4, true)}<g ${express.svg}>${train(iso, P, express.u, RAIL.express, z, true)}</g></g>`,
    landmarks: station(iso, P) + plaza(iso, P),
    shore: `<g data-rail="tram">${track(iso, P, RAIL.tram, 0, Math.min(ta - 2, from - 3), to + 3, false)}</g>`,
    platforms: `<g data-layer="tram-platforms">${stops}</g>`,
    tram: `<g data-layer="tram"><g ${tram.svg}>${train(iso, P, tram.u, RAIL.tram, 0, false)}</g></g>`,
    overhead: `<g data-layer="tram-overhead">${wire}</g>`,
    harbor: harbor(iso, P),
    boats: `<g data-layer="boats">${ships.svg}</g>`,
  };
}
