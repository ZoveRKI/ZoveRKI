// 贡献城市的天空和天气。天色跟着所在地的时段变：夜里有星星和月亮，白天有太阳，黎明和黄昏是低处的太阳和
// 彩色的天际；天气决定有几朵云、星星和日月还看不看得见，以及下不下雨、下不下雪、起不起雾、打不打雷。
// 星星、月亮和飞机照着 Giorgi Kobaidze 的设计实现（见 NOTICE）。
// back 画在楼的后面（天际的渐变、星星、日月、飞机、云、闪电），front 画在楼的前面（雾、雨、雪、闪光）。
import type { Phase, Sky, Weather } from '../data.ts';
import { esc, mix, r2, random } from '../svg.ts';
import { theme as t } from '../theme.ts';

const S = t.sky;

/** 天空的布局，都是切片里的坐标 */
export type Stage = {
  /** 天气效果覆盖的范围：左右到窗口的边框，上下是城市的顶和底 */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** 地面后方的轮廓：左角、最远的角、右角；天际的渐变画在这条折线上面 */
  horizon: [number, number][];
  /** 月亮和白天的太阳挂在高处，黎明和黄昏的太阳在低处 */
  high: [number, number];
  low: [number, number];
  /** 缩放，手机版小一些 */
  k: number;
  /** 云的左端、高度和大小，天气越差用到的越多 */
  clouds: [number, number, number][];
  /** 飞机从左边飞进来的高度，飞到右边时升高 rise */
  plane: { y: number; rise: number };
  /** 星星散布的范围和数量 */
  stars: { x0: number; x1: number; y0: number; y1: number; n: number };
};

export type Scene = { css: string; defs: string; back: string; front: string };

/** 各种天气：几朵云，星星还剩多少，日月的亮度，天色和云变灰多少 */
type Traits = { clouds: number; stars: number; light: number; gray: number };
const TRAITS: Record<Weather, Traits> = {
  clear: { clouds: 0, stars: 1, light: 1, gray: 0 },
  cloudy: { clouds: 2, stars: 0.7, light: 1, gray: 0 },
  overcast: { clouds: 4, stars: 0.15, light: 0.3, gray: 0.55 },
  fog: { clouds: 1, stars: 0.1, light: 0.45, gray: 0.6 },
  drizzle: { clouds: 3, stars: 0.2, light: 0.35, gray: 0.45 },
  rain: { clouds: 4, stars: 0, light: 0.2, gray: 0.6 },
  snow: { clouds: 3, stars: 0.1, light: 0.35, gray: 0.5 },
  storm: { clouds: 4, stars: 0, light: 0, gray: 0.75 },
};

/** 天气让颜色变灰多少，城市周围的景物也按它上色 */
export const weatherGray = (w: Weather | null): number => TRAITS[w ?? 'clear'].gray;

/** 星星能出现在多高的地方（占星空高度的比例）：夜里满天，黎明和黄昏只剩高处，白天没有 */
const STAR_REACH: Record<Phase, number> = { night: 1, dawn: 0.35, day: 0, dusk: 0.45 };

/** 天际的渐变，从上（透明）到地平线：[位置, 颜色, 不透明度] */
const GLOW: Record<Phase, [number, string, number][]> = {
  night: [
    [0, t.accent, 0],
    [1, t.accent, 0.08],
  ],
  dawn: [
    [0, S.violet, 0],
    [0.45, S.violet, 0.16],
    [0.75, S.dawn, 0.18],
    [1, '#ffb877', 0.32],
  ],
  day: [
    [0, S.day, 0],
    [0.35, S.day, 0.07],
    [0.7, t.accent, 0.14],
    [1, S.day, 0.28],
  ],
  dusk: [
    [0, S.violet, 0],
    [0.4, S.violet, 0.22],
    [0.72, t.accent2, 0.2],
    [1, S.dusk, 0.38],
  ],
};

/** 云的轮廓和填充色 */
const CLOUD: Record<Phase, [rim: string, fill: string]> = {
  night: [mix(t.bg, S.moon, 0.3), mix(t.bg, '#24304a', 0.75)],
  dawn: [S.dawn, mix(t.bg, S.dawn, 0.14)],
  day: [t.accent, mix(t.bg, S.day, 0.2)],
  dusk: [S.dusk, mix(t.bg, S.dusk, 0.15)],
};

/** 坏天气把颜色往这个灰色拉 */
export const GRAY = '#7d8798';

/** 时段的颜色，用在城市下面那行字里 */
const PHASE_COLOR: Record<Phase, string> = { night: S.moon, dawn: S.dawn, day: S.sun, dusk: S.dusk };

const WHEN: Record<Phase, string> = { night: 'at night', dawn: 'at dawn', day: 'by day', dusk: 'at dusk' };
const UNDER: Record<Weather, string> = {
  clear: 'under a clear sky',
  cloudy: 'under a few clouds',
  overcast: 'under an overcast sky',
  fog: 'in the fog',
  drizzle: 'in a drizzle',
  rain: 'in the rain',
  snow: 'in the snow',
  storm: 'in a thunderstorm',
};

/** 替代文字里的天色，比如 at night in the rain (sunrise 05:51 JST) */
export function skyAlt(sky: Sky | null): string {
  if (!sky) return ' at night';
  const weather = sky.weather ? ` ${UNDER[sky.weather]}` : '';
  return ` ${WHEN[sky.phase]}${weather} (${sky.event} ${sky.at})`;
}

/** 城市下面的一行字：时段、天气、日出或日落时间 */
export function skyText(sky: Sky): string {
  const rest = [sky.weather, `${sky.event} ${sky.at}`].filter((s): s is string => Boolean(s));
  return `<tspan fill="${PHASE_COLOR[sky.phase]}" font-weight="700">${sky.phase}</tspan>${rest.map((s) => ` · ${esc(s)}`).join('')}`;
}

const pts = (list: [number, number][]): string => list.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ');

/** 地平线（地面后方的轮廓）在 x 处的高度 */
function horizonAt(st: Stage, x: number): number {
  const [first, ...rest] = st.horizon;
  if (!first) return st.y1;
  let [px, py] = first;
  if (x <= px) return py;
  for (const [qx, qy] of rest) {
    if (x <= qx) return py + ((qy - py) * (x - px)) / (qx - px);
    [px, py] = [qx, qy];
  }
  return py;
}

function stars(st: Stage, phase: Phase, keep: number): string {
  const next = random('stars');
  const { x0, x1, y0, y1, n } = st.stars;
  const reach = y0 + (y1 - y0) * STAR_REACH[phase];
  const [mx, my] = st.high;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y, o, lot] = [x0 + next() * (x1 - x0), y0 + next() * (y1 - y0), 0.35 + next() * 0.5, next()];
    // 太低（会落在楼缝里）、离月亮太近、天亮了或者被云遮住的星星不画
    if (y > reach || lot >= keep || y > horizonAt(st, x) - 40 * st.k || Math.hypot(x - mx, y - my) < 34 * st.k) continue;
    const r = [0.6, 0.85, 1.15][i % 3] ?? 1;
    const opacity = phase === 'night' ? o : o * 0.7;
    out.push(
      `<circle${i % 3 === 0 ? ' class="tw"' : ''} cx="${r2(x)}" cy="${r2(y)}" r="${r2(r * Math.max(0.75, st.k))}" opacity="${opacity.toFixed(2)}"/>`,
    );
  }
  return out.length ? `<g fill="${S.star}">${out.join('')}</g>` : '';
}

/** 天空里的一样东西：图形，以及它要用到的 defs 和 CSS */
type Part = { svg: string; defs?: string; css?: string };

/** 月牙：亮的圆上面叠一个背景色的圆 */
function moon(st: Stage, light: number): Part {
  const [cx, cy] = st.high;
  const k = st.k;
  return {
    defs: `<radialGradient id="moonglow"><stop offset="0" stop-color="${S.moon}" stop-opacity=".22"/><stop offset="1" stop-color="${S.moon}" stop-opacity="0"/></radialGradient>`,
    svg: `<g opacity="${light}"><circle cx="${cx}" cy="${cy}" r="${r2(38 * k)}" fill="url(#moonglow)"/><circle cx="${cx}" cy="${cy}" r="${r2(13 * k)}" fill="${S.moon}"/><circle cx="${r2(cx + 5.5 * k)}" cy="${r2(cy - 4.5 * k)}" r="${r2(11.5 * k)}" fill="${t.bg}"/></g>`,
  };
}

/** 白天的太阳：光晕、慢慢转的一圈光芒、日面；天阴的时候只剩一团光 */
function sunHigh(st: Stage, light: number): Part {
  const [cx, cy] = st.high;
  const k = st.k;
  const defs = `<radialGradient id="sunglow"><stop offset="0" stop-color="${S.sun}" stop-opacity=".34"/><stop offset=".45" stop-color="${S.sun}" stop-opacity=".1"/><stop offset="1" stop-color="${S.sun}" stop-opacity="0"/></radialGradient>`;
  const glow = `<circle cx="${cx}" cy="${cy}" r="${r2(72 * k)}" fill="url(#sunglow)"/>`;
  if (light < 0.5) return { defs, svg: `<g opacity="${r2(0.4 + light)}">${glow}</g>` };
  // 光芒是一圈虚线：12 段短而粗的线
  const r = 24 * k;
  const step = (2 * Math.PI * r) / 12;
  const rays = `<circle class="rays" cx="${cx}" cy="${cy}" r="${r2(r)}" fill="none" stroke="${S.sun}" stroke-width="${r2(7 * k)}" stroke-dasharray="${r2(step * 0.16)} ${r2(step * 0.84)}" opacity=".7"/>`;
  return {
    defs,
    css: `@keyframes zspin{to{transform:rotate(360deg)}}
.rays{transform-origin:${cx}px ${cy}px;animation:zspin 90s linear infinite}`,
    svg: `<g opacity="${light}">${glow}${rays}<circle cx="${cx}" cy="${cy}" r="${r2(14 * k)}" fill="${S.sun}" filter="url(#soft)"/><circle cx="${cx}" cy="${cy}" r="${r2(14 * k)}" fill="${S.sunCore}"/></g>`,
  };
}

/** 黎明和黄昏低处的太阳：大片的光晕，日面从上到下由黄变成粉或橙；天阴的时候只剩光晕 */
function sunLow(st: Stage, phase: Phase, light: number): Part {
  const [cx, cy] = st.low;
  const k = st.k;
  const edge = phase === 'dawn' ? S.dawn : S.dusk;
  const face = phase === 'dawn' ? '#fff1c1' : '#ffe27a';
  const r = r2(22 * k);
  return {
    defs: `<radialGradient id="sunglow"><stop offset="0" stop-color="${edge}" stop-opacity=".32"/><stop offset=".5" stop-color="${edge}" stop-opacity=".1"/><stop offset="1" stop-color="${edge}" stop-opacity="0"/></radialGradient>
<linearGradient id="sunface" x1="0" y1="0" x2="0" y2="1"><stop offset=".1" stop-color="${face}"/><stop offset="1" stop-color="${edge}"/></linearGradient>`,
    svg: `<g opacity="${r2(Math.max(0.3, light))}"><circle cx="${cx}" cy="${cy}" r="${r2(96 * k)}" fill="url(#sunglow)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${edge}" filter="url(#soft)" opacity=".7"/>${light >= 0.5 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#sunface)"/>` : ''}</g>`,
  };
}

/** 一朵云：底下一条圆角矩形，上面三团。先描每一块的边、再把每一块填上，只留下整朵云的外轮廓 */
function cloud(x: number, y: number, size: number, k: number, i: number, [rim, fill]: [string, string]): string {
  const u = size * k;
  const parts =
    `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(70 * u)}" height="${r2(13 * u)}" rx="${r2(6.5 * u)}"/>` +
    `<circle cx="${r2(x + 17 * u)}" cy="${r2(y + 1 * u)}" r="${r2(10 * u)}"/>` +
    `<circle cx="${r2(x + 35 * u)}" cy="${r2(y - 4 * u)}" r="${r2(14 * u)}"/>` +
    `<circle cx="${r2(x + 54 * u)}" cy="${r2(y + 2 * u)}" r="${r2(8.5 * u)}"/>`;
  return `<g class="c${i % 3}"><g fill="none" stroke="${rim}" stroke-width="${r2(4 * k)}" opacity=".35" filter="url(#soft)">${parts}</g><g fill="none" stroke="${rim}" stroke-width="${r2(1.8 * k)}">${parts}</g><g fill="${fill}">${parts}</g></g>`;
}

/** 两架远处的双发客机共用 48 秒循环，沿不同曲线飞行；左翼红灯、右翼绿灯、机尾白灯。 */
function plane(st: Stage): Part {
  const k = st.k;
  const width = st.x1 - st.x0;
  const bezier = (f: number, values: number[]): number => (1 - f) ** 3 * values[0]! + 3 * (1 - f) ** 2 * f * values[1]! + 3 * (1 - f) * f * f * values[2]! + f ** 3 * values[3]!;
  const routes = [
    { seconds: 26, reverse: false, point: (f: number): [number, number] => [st.x0 - 40 * k + (width + 80 * k) * f, st.plane.y - st.plane.rise * f - 2 * k * Math.sin(f * Math.PI)] },
    { seconds: 34, reverse: true, point: (f: number): [number, number] => [
      bezier(f, [st.x1 + 48 * k, st.x0 + width * .68, st.x0 + width * .3, st.x0 - 48 * k]),
      bezier(f, [st.plane.y + width * .31, st.plane.y + width * .19, st.plane.y - 6 * k, st.plane.y - 8 * k]),
    ] },
  ];
  const css: string[] = [];
  const aircraft = routes.map((route, i) => {
    const position = (f: number): string => {
      const p = route.point(f);
      const a = route.point(Math.max(0, f - .0001));
      const b = route.point(Math.min(1, f + .0001));
      const direction = route.reverse ? -1 : 1;
      const angle = Math.atan2((b[1] - a[1]) * direction, (b[0] - a[0]) * direction) * 180 / Math.PI;
      return `translate(${r2(p[0])}px,${r2(p[1])}px) rotate(${r2(angle)}deg)`;
    };
    // 飞出后留在画外，下一轮同时从两侧入场，避免两条航线在左端接近时发生相遇。
    const frames = Array.from({ length: 49 }, (_, j) => `${r2(j / 48 * route.seconds / 48 * 100)}%{transform:${position(j / 48)}}`);
    css.push(`@keyframes zflight${i}{${frames.join('')}100%{transform:${position(1)}}}`);
    const start = position(0).replaceAll('px', '').replaceAll('deg', '');
    return { i, route, start };
  });
  // 模型以机身中心为原点，转弯时机头随曲线切线转向，反向飞机用镜像保留尾翼的朝上方向。
  const wings = `<path d="M13 .2L7.2 -4.8H5.3L8.6 .8Z" fill="${t.faint}"/><rect x="9.4" y="-2.2" width="4" height="1.3" rx=".6" fill="${t.dim}"/><path d="M4 .8L1 -1.7H-.2L1.4 1.4ZM4.8 1.5L1.6 3.5H-.5L1.3 1.2Z" fill="${t.faint}"/>`;
  const body = `<path d="M0 .4L3 -.2H19.2Q22 -.2 24 1Q22.5 2.5 19.2 2.5L3 2Z" fill="${t.dim}"/><path d="M2 1.4L19.2 1.7Q22.2 1.7 24 1Q22.5 2.5 19.2 2.5L3 2Z" fill="${t.faint}"/><path d="M3 .1H19" stroke="${t.fg}" stroke-width=".5" opacity=".6"/>`;
  const cockpit = `<path d="M20 .1L21.6 .4 22.5 1H20Z" fill="${t.panel}"/>`;
  const windows = [5.5, 7.5, 9.5, 11.5, 13.5, 15.5, 17.5]
    .map((x) => `<rect x="${x}" y=".5" width=".7" height=".7" rx=".2" fill="${t.panel}"/>`)
    .join('');
  const near = `<path d="M1.3 .3L2.1 -3.6H3.3L6 .3Z" fill="${t.accent}" opacity=".7"/><path d="M16.2 1.5L7.3 5.2H5.3L10.5 1.1Z" fill="${t.dim}"/><path d="M10.5 1.2L6.4 4.8" stroke="${t.fg}" stroke-width=".4" opacity=".5"/><rect x="10.7" y="3.1" width="4.6" height="1.6" rx=".8" fill="${t.faint}"/><path d="M14.4 3.3V4.5" stroke="${t.panel}" stroke-width=".7"/>`;
  // 机头朝右时，上侧是左翼、下侧是右翼；灯光随模型一起转弯和镜像，机头不设灯。
  const lights = `<circle class="blip" cx="6.3" cy="-4.8" r="1.6" fill="#ff7b72"/><circle class="blip" cx="6.3" cy="5.2" r="1.6" fill="${t.green}"/><circle class="blip" cx="0" cy="1" r="1.6" fill="#f0f6fc" style="animation-delay:.7s"/>`;
  const model = `${wings}${body}${cockpit}${windows}${near}${lights}`;
  return {
    css: `${css.join('\n')}
@keyframes zblip{0%,90%,100%{opacity:0}93%{opacity:1}}
.plane{animation:zflight0 48s linear infinite both}.blip{animation:zblip 1.4s infinite}`,
    svg: `<g clip-path="url(#frame)">${aircraft.map(({ i, route, start }) => `<g class="plane" data-flight="${i}" transform="${start}" style="animation-name:zflight${i}"><g transform="scale(${route.reverse ? -k : k} ${k})"><g transform="translate(-12 0)">${model}</g></g></g>`).join('')}</g>`,
  };
}

/** 闪电：从第一朵云下面往下劈的一道折线，只在闪光的那一下看得见 */
function bolt(st: Stage): string {
  const [x, y, size] = st.clouds[0] ?? [st.x0, st.y0, 1];
  const u = size * st.k;
  const steps: [number, number][] = [
    [-7, 20],
    [9, 16],
    [-11, 24],
    [7, 18],
    [-6, 22],
  ];
  let [px, py] = [x + 32 * u, y + 13 * u];
  const d = [`M${r2(px)} ${r2(py)}`];
  for (const [dx, dy] of steps) {
    [px, py] = [px + dx * st.k, py + dy * st.k];
    d.push(`L${r2(px)} ${r2(py)}`);
  }
  const path = d.join('');
  return `<g class="bolt" opacity="0" fill="none" stroke-linejoin="round"><path d="${path}" stroke="${S.day}" stroke-width="${r2(4 * st.k)}" filter="url(#soft)"/><path d="${path}" stroke="${t.bright}" stroke-width="${r2(1.4 * st.k)}"/></g>`;
}

/**
 * 一层雨或雪：在天气范围里随机撒一遍，再复制一份放在正上方一屏的位置，整层往下移动一屏后从头开始，
 * 看不出接缝。slant 是每往下 1px 向左偏多少；关掉动画时停在原地。
 */
function sheet(st: Stage, cls: string, items: string, slant: number, seconds: number): string {
  const h = r2(st.y1 - st.y0);
  return `<g class="${cls}" style="animation-duration:${seconds}s">${items}<g transform="translate(${r2(slant * h)} ${-h})">${items}</g></g>`;
}

/** 雨点：[数量, 长度, 一屏落多少秒, 不透明度, 粗细] */
type Drops = [n: number, len: number, seconds: number, opacity: number, width: number];
const RAIN: Partial<Record<Weather, Drops[]>> = {
  drizzle: [[60, 5, 1.7, 0.32, 0.8]],
  rain: [
    [80, 7, 1.15, 0.3, 0.8],
    [55, 12, 0.75, 0.45, 1.1],
  ],
  storm: [
    [100, 8, 0.95, 0.32, 0.8],
    [75, 14, 0.6, 0.5, 1.2],
  ],
};
const SLANT = 0.16;

function rain(st: Stage, layers: Drops[], scale: number): string {
  const next = random('rain');
  const w = st.x1 - st.x0 + SLANT * (st.y1 - st.y0);
  return layers
    .map(([n, len, seconds, opacity, width]) => {
      const d: string[] = [];
      for (let i = 0; i < Math.round(n * scale); i++) {
        const [x, y] = [st.x0 + next() * w, st.y0 + next() * (st.y1 - st.y0)];
        d.push(`M${r2(x)} ${r2(y)}l${r2(-SLANT * len * st.k)} ${r2(len * st.k)}`);
      }
      const path = `<path d="${d.join('')}" stroke="#a6c8ef" stroke-width="${r2(width * Math.max(0.8, st.k))}" stroke-linecap="round" opacity="${opacity}"/>`;
      return sheet(st, 'rain', path, SLANT, seconds);
    })
    .join('');
}

/** 雪花：[数量, 半径, 一屏落多少秒, 不透明度]，每层再左右飘 */
const SNOW: [n: number, r: number, seconds: number, opacity: number][] = [
  [60, 0.9, 26, 0.45],
  [40, 1.3, 18, 0.65],
  [22, 1.8, 12, 0.85],
];

function snow(st: Stage, scale: number): string {
  const next = random('snow');
  return SNOW.map(([n, r, seconds, opacity], i) => {
    const dots: string[] = [];
    for (let j = 0; j < Math.round(n * scale); j++) {
      const [x, y, s] = [st.x0 + next() * (st.x1 - st.x0), st.y0 + next() * (st.y1 - st.y0), 0.7 + next() * 0.6];
      dots.push(`<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r * s * Math.max(0.75, st.k))}"/>`);
    }
    return `<g class="sway" style="animation-duration:${3.5 + i}s" fill="#eef4fc" opacity="${opacity}">${sheet(st, 'snow', dots.join(''), 0, seconds)}</g>`;
  }).join('');
}

/** 雾：一层很淡的雾气，加上三条顺着城市走向、贴着地面和楼腰的雾带，沿着城市慢慢飘 */
function fog(st: Stage): string {
  const veil = `<rect x="${st.x0}" y="${r2(st.y0)}" width="${r2(st.x1 - st.x0)}" height="${r2(st.y1 - st.y0)}" fill="${GRAY}" opacity=".07"/>`;
  const [L, A, R] = st.horizon;
  if (!L || !A || !R) return veil;
  // 沿着周的方向是城市的长边，across 是地面横过来的宽度
  const len = Math.hypot(R[0] - A[0], R[1] - A[1]);
  const [dx, dy] = [(R[0] - A[0]) / len, (R[1] - A[1]) / len];
  const across = Math.abs((L[0] - A[0]) * dy - (L[1] - A[1]) * dx);
  const [cx, cy] = [(L[0] + R[0]) / 2, (L[1] + R[1]) / 2];
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  // 雾带比城市长得多，两头落在天气范围外面被裁掉，看不到雾带的端头
  const reach = len / 2 + (st.x1 - st.x0);
  const bands = [-1, -0.35, 0.3].map((f, i) => {
    const bh = across * 0.9;
    const style = `animation-duration:${28 + i * 8}s${i % 2 ? ';animation-direction:alternate-reverse' : ''}`;
    return `<rect class="fog" style="${style}" x="${r2(cx - reach)}" y="${r2(cy + f * across - bh / 2)}" width="${r2(2 * reach)}" height="${r2(bh)}" fill="url(#fogband)" opacity="${[0.3, 0.28, 0.38][i]}"/>`;
  });
  return `${veil}<g transform="rotate(${r2(angle)} ${r2(cx)} ${r2(cy)})">${bands.join('')}</g>`;
}

/** 天空和天气。sky 是 null（没有配置所在地）时画成没有天气的夜晚 */
export function scene(sky: Sky | null, st: Stage): Scene {
  const phase = sky?.phase ?? 'night';
  const weather = sky?.weather ?? 'clear';
  const w = TRAITS[weather];
  const k = st.k;
  const gray = (c: string, f = 1): string => mix(c, GRAY, w.gray * f);
  const defs: string[] = [
    `<clipPath id="frame"><rect x="${st.x0}" y="0" width="${r2(st.x1 - st.x0)}" height="${r2(st.y1 + 40)}"/></clipPath>`,
  ];
  const css: string[] = [
    `@keyframes ztw{50%{opacity:.15}}
.tw{animation:ztw 3s ease-in-out infinite}
@keyframes zdrift{from{transform:translateX(${r2(-36 * k)}px)}to{transform:translateX(${r2(36 * k)}px)}}
.c0{animation:zdrift 70s ease-in-out infinite alternate}.c1{animation:zdrift 95s ease-in-out infinite alternate-reverse}.c2{animation:zdrift 120s ease-in-out infinite alternate}`,
  ];
  const back: string[] = [];
  const front: string[] = [];

  // 天际的渐变：从城市顶上的透明，到地平线最低处（地面的右角）最浓。只画在地面后方两条边的上面，
  // 过了城市的左右两头就淡出；边缘模糊，看不出接缝
  const [L, A, R] = st.horizon;
  if (L && A && R) {
    const stops = GLOW[phase]
      .map(([o, c, a]) => `<stop offset="${o}" stop-color="${gray(c)}" stop-opacity="${r2(a * (1 - w.gray * 0.4))}"/>`)
      .join('');
    const at = (x: number): number => r2(Math.min(1, Math.max(0, (x - st.x0) / (st.x1 - st.x0))));
    const ends = [
      [L[0] - 48 * k, '#000'],
      [L[0], '#fff'],
      [R[0], '#fff'],
      [R[0] + 48 * k, '#000'],
    ] as const;
    const box = `x="${st.x0}" y="${r2(st.y0)}" width="${r2(st.x1 - st.x0)}" height="${r2(R[1] - st.y0)}"`;
    const region: [number, number][] = [[st.x0, st.y0], [st.x1, st.y0], [st.x1, R[1]], R, A, L, [st.x0, L[1]]];
    defs.push(
      `<linearGradient id="skyglow" gradientUnits="userSpaceOnUse" x1="0" y1="${r2(st.y0)}" x2="0" y2="${r2(R[1])}">${stops}</linearGradient>`,
      `<linearGradient id="skyends" gradientUnits="userSpaceOnUse" x1="${st.x0}" y1="0" x2="${st.x1}" y2="0">${ends.map(([x, c]) => `<stop offset="${at(x)}" stop-color="${c}"/>`).join('')}</linearGradient>`,
      `<filter id="haze" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${r2(8 * k)}"/></filter>`,
      `<mask id="sky" maskUnits="userSpaceOnUse" ${box}><polygon points="${pts(region)}" fill="url(#skyends)" filter="url(#haze)"/></mask>`,
    );
    back.push(`<rect ${box} fill="url(#skyglow)" mask="url(#sky)"/>`);
  }

  // 星星，月亮或太阳（天太阴时看不见月亮），飞机，然后是云：飞机从云后面穿过
  const parts: Part[] = [{ svg: stars(st, phase, w.stars) }];
  if (phase === 'night') {
    if (w.light > 0) parts.push(moon(st, w.light));
  } else if (phase === 'day') parts.push(sunHigh(st, w.light));
  else parts.push(sunLow(st, phase, w.light));
  parts.push(plane(st));
  for (const p of parts) {
    if (p.defs) defs.push(p.defs);
    if (p.css) css.push(p.css);
  }
  const [rim, fill] = CLOUD[phase];
  const clouds = st.clouds
    .slice(0, w.clouds)
    .map(([x, y, size], i) => cloud(x, y, size, k, i, [gray(rim), gray(fill, 0.5)]));
  if (weather === 'storm') {
    clouds.push(bolt(st));
    css.push(`@keyframes zbolt{0%,86%,91%,100%{opacity:0}87%,89.5%{opacity:1}88%{opacity:.35}}
@keyframes zflash{0%,86%,91%,100%{opacity:0}87%{opacity:.16}88%{opacity:.04}89.5%{opacity:.24}}
.bolt{animation:zbolt 7s infinite}.flash{animation:zflash 7s infinite}`);
  }
  back.push(`<g class="in" style="animation-delay:.35s">${parts.map((p) => p.svg).join('\n')}
<g clip-path="url(#frame)">${clouds.join('')}</g></g>`);

  // 楼前面的天气，上下两头淡出
  const scale = k < 1 ? 0.55 : 1;
  const h = r2(st.y1 - st.y0);
  if (weather === 'fog') {
    defs.push(
      `<linearGradient id="fogband" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${GRAY}" stop-opacity="0"/><stop offset=".5" stop-color="${GRAY}" stop-opacity=".55"/><stop offset="1" stop-color="${GRAY}" stop-opacity="0"/></linearGradient>`,
    );
    css.push(`@keyframes zfog{from{transform:translateX(${r2(-40 * k)}px)}to{transform:translateX(${r2(40 * k)}px)}}
.fog{animation:zfog 30s ease-in-out infinite alternate}`);
    front.push(fog(st));
  }
  const drops = RAIN[weather];
  if (drops) {
    css.push(`@keyframes zrain{to{transform:translate(${r2(-SLANT * h)}px,${h}px)}}
.rain{animation:zrain 1s linear infinite}`);
    front.push(rain(st, drops, scale));
  }
  if (weather === 'snow') {
    css.push(`@keyframes zsnow{to{transform:translateY(${h}px)}}
@keyframes zsway{from{transform:translateX(${r2(-6 * k)}px)}to{transform:translateX(${r2(6 * k)}px)}}
.snow{animation:zsnow 16s linear infinite}.sway{animation:zsway 4s ease-in-out infinite alternate}`);
    front.push(snow(st, scale));
  }
  if (weather === 'storm') {
    front.push(`<rect class="flash" x="${st.x0}" y="${r2(st.y0)}" width="${r2(st.x1 - st.x0)}" height="${h}" fill="#dbe8ff" opacity="0"/>`);
  }
  if (front.length) {
    defs.push(
      `<linearGradient id="wxfade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset=".12" stop-color="#fff"/><stop offset=".88" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>`,
      `<mask id="wx" maskUnits="userSpaceOnUse" x="${st.x0}" y="${r2(st.y0)}" width="${r2(st.x1 - st.x0)}" height="${h}"><rect x="${st.x0}" y="${r2(st.y0)}" width="${r2(st.x1 - st.x0)}" height="${h}" fill="url(#wxfade)"/></mask>`,
    );
  }

  return {
    css: css.join('\n'),
    defs: defs.join('\n'),
    back: back.join('\n'),
    front: front.length ? `<g class="in" style="animation-delay:1.1s"><g mask="url(#wx)">${front.join('')}</g></g>` : '',
  };
}
