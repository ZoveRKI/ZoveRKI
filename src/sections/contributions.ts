// 贡献城市：过去一年每天一栋楼。每周一排，从左上往右下排，越往右下越新；一周七天从右上往左下排。
// 楼高按当天贡献数的平方根算，最忙的一天不会把其他楼压得看不见；楼顶的颜色是 GitHub 的贡献等级。
// 楼和窗户照着 Giorgi Kobaidze 的设计实现（见 NOTICE）；天空和天气见 scene.ts，周围的树、海、路、车和船见 landscape.ts。
import type { Ctx } from '../context.ts';
import type { Day, Phase } from '../data.ts';
import { sectionTop, slice } from '../frame.ts';
import { daysBetween, delay, esc, mix, MONTHS, monthDay, num, plural, r2, random, textWidth, weekday } from '../svg.ts';
import { type Geo, theme as t, up } from '../theme.ts';
import { landscape, ROAD } from './landscape.ts';
import { scene, skyAlt, skyText, type Stage } from './scene.ts';

/** 等距投影：一格宽 tw、高 tw/2；楼最高 H；gap 是楼与楼之间的空隙占一格的比例；win 是窗户的缩放 */
type Proj = { tw: number; H: number; gap: number; win: number };
const DESKTOP_PROJ: Proj = { tw: 24, H: 100, gap: 0.1, win: 1 };
const PHONE_PROJ: Proj = { tw: 13, H: 56, gap: 0.1, win: 0.55 };

const WEEKDAY_LABELS: [number, string][] = [
  [1, 'Mon'],
  [5, 'Fri'],
];

/** 夜里亮着的窗户，别的时段还亮着多少：都是夜里那些窗户的一部分，换时段时窗户的位置不变 */
const LIT: Record<Phase, number> = { night: 0.55, dusk: 0.3, dawn: 0.2, day: 0.06 };

const CSS = `@keyframes zfl{0%,40%,100%{opacity:1}45%,60%{opacity:.1}}
.fl0{animation:zfl 5s infinite}.fl1{animation:zfl 7s 2s infinite}.fl2{animation:zfl 9s 4s infinite}
@keyframes zbeacon{0%,100%{opacity:.2}50%{opacity:1}}
.beacon{animation:zbeacon 2.4s ease-in-out infinite}`;

export const contributionsAlt = (c: Ctx): string =>
  `${num(c.total)} contributions in the last year, drawn as a seaside city with one building per day${skyAlt(c.sky)}, with boats, a high-speed train and a seaside tram. Current streak ${plural(c.streak.current, 'day')}, longest ${plural(c.streak.longest, 'day')}.`;

type Cell = { d: Day; X: number; Z: number };
type Pt = [number, number];

/** X 是第几周，Z 是星期几（0 是周日） */
function layout(days: Day[]): Cell[] {
  const first = days[0]?.date ?? '';
  const offset = weekday(first);
  return days.map((d) => {
    const k = daysBetween(first, d.date) + offset;
    return { d, X: Math.floor(k / 7), Z: k % 7 };
  });
}

/** 上方的汇总：总贡献数，加上四个小统计；返回标记和底部位置 */
function summary(g: Geo, c: Ctx, y: number): [string, number] {
  const big = g.phone ? 30 : 40;
  const total = num(c.total);
  const lx = r2(g.left + textWidth(total, big) + 12);
  const stats: [string, string][] = [
    [num(c.active), 'active days'],
    [plural(c.streak.current, 'day'), 'current streak'],
    [plural(c.streak.longest, 'day'), 'longest streak'],
    [num(c.best?.count ?? 0), c.best ? `best · ${monthDay(c.best.date)}` : 'best day'],
  ];
  const colW = g.phone ? (g.right - g.left) / 2 : 124;
  const cells = stats.map(([value, label], i) => {
    const x = r2(g.phone ? g.left + (i % 2) * colW : g.right - (4 - i) * colW);
    const vy = g.phone ? y + big + 26 + Math.floor(i / 2) * 44 : y + 14;
    return `<g class="in" ${delay(0.25 + i * 0.08)}><text x="${x}" y="${vy}" font-size="${g.fs + 2}" font-weight="700">${esc(value)}</text><text x="${x}" y="${vy + 19}" class="faint" font-size="${g.small - 1}">${esc(label)}</text></g>`;
  });
  const markup = `<g class="in" ${delay(0.15)}>
<text x="${g.left}" y="${y + big - 6}" font-size="${big}" font-weight="700" fill="${t.accent}" opacity=".45" filter="url(#soft)">${total}</text>
<text x="${g.left}" y="${y + big - 6}" font-size="${big}" font-weight="700" class="hi">${total}</text>
<text x="${lx}" y="${r2(y + big * 0.42)}" class="dim" font-size="${g.small}">contributions</text>
<text x="${lx}" y="${r2(y + big * 0.42 + g.small + 5)}" class="faint" font-size="${g.small}">in the last year</text>
</g>
${cells.join('\n')}`;
  return [markup, g.phone ? y + big + 26 + 44 + 19 : y + big];
}

/** 各个时段楼的颜色：左右两面和暗着的窗户。白天的玻璃映着天光；黎明和黄昏的太阳在右边，右面偏暖 */
function facade(p: Phase): { left: string; right: string; offL: string; offR: string } {
  const C = t.city;
  switch (p) {
    case 'night':
      return { left: C.left, right: C.right, offL: C.winOff, offR: C.winOff };
    case 'dawn':
      return {
        left: mix(C.left, t.sky.violet, 0.12),
        right: mix(C.right, t.sky.dawn, 0.1),
        offL: C.winOff,
        offR: mix(C.winOff, t.sky.dawn, 0.3),
      };
    case 'day':
      return {
        left: mix(C.left, t.sky.day, 0.12),
        right: mix(C.right, t.sky.day, 0.08),
        offL: mix(C.winOff, t.sky.day, 0.18),
        offR: mix(C.winOff, t.sky.day, 0.26),
      };
    case 'dusk':
      return {
        left: mix(C.left, t.sky.violet, 0.14),
        right: mix(C.right, t.sky.dusk, 0.12),
        offL: C.winOff,
        offR: mix(C.winOff, t.sky.dusk, 0.42),
      };
  }
}

const pt = ([x, y]: Pt): string => `${r2(x)},${r2(y)}`;
const polygon = (list: Pt[], fill: string): string => `<polygon points="${list.map(pt).join(' ')}" fill="${fill}"/>`;

type Facade = ReturnType<typeof facade>;

/**
 * 楼两面的窗户：每层每面两扇。哪里有窗、亮不亮由当天的日期决定，同一天的楼每次画出来都一样；
 * 楼变高时只在上面加层，下面几层不变。faces 是左右两面的底边，从左往右；flick 给闪烁的窗户编号
 */
function windows(
  date: string,
  faces: [Pt, Pt][],
  h: number,
  k: number,
  p: Phase,
  F: Facade,
  flick: () => number,
): string {
  const next = random(date);
  const [onL, onR, offL, offR]: string[][] = [[], [], [], []];
  const flickers: string[] = [];
  const rows = Math.floor((h - 6 * k) / (7 * k));
  for (let row = 0; row < rows; row++) {
    const z0 = (5 + row * 7) * k;
    const z1 = z0 + 3.2 * k;
    for (const [i, [a, b]] of faces.entries()) {
      for (const s0 of [0.18, 0.58]) {
        const [lot, wall, blink] = [next(), next(), next()];
        // 夜里不亮的位置有一半是墙
        if (lot >= LIT.night && wall < 0.5) continue;
        const at = (s: number, z: number): Pt => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s - z];
        const seg = `M${pt(at(s0, z0))}L${pt(at(s0 + 0.26, z0))}L${pt(at(s0 + 0.26, z1))}L${pt(at(s0, z1))}Z`;
        if (lot >= LIT[p]) (i ? offR : offL).push(seg);
        else if (blink < 0.04) flickers.push(`<path class="fl${flick() % 3}" d="${seg}" fill="${i ? t.city.winSide : t.city.winOn}"/>`);
        else (i ? onR : onL).push(seg);
      }
    }
  }
  const paths: [string[], string][] = [
    [offL, F.offL],
    [offR, F.offR],
    [onL, t.city.winOn],
    [onR, t.city.winSide],
  ];
  return paths.map(([d, fill]) => (d.length ? `<path d="${d.join('')}" fill="${fill}"/>` : '')).join('') + flickers.join('');
}

/**
 * 城市本体；top 是最高的楼能到的位置。返回分开画的几层（地块、楼、文字）、最下面的位置、
 * 地面后方的轮廓（左角、最远的角、右角），以及给周围景物用的投影和周数
 */
function city(
  g: Geo,
  c: Ctx,
  top: number,
): {
  tiles: string;
  blocks: string;
  labels: string;
  bottom: number;
  horizon: Pt[];
  xy: (u: number, v: number, z?: number) => Pt;
  weeks: number;
} {
  const { tw, H, gap, win } = g.phone ? PHONE_PROJ : DESKTOP_PROJ;
  const p = c.sky?.phase ?? 'night';
  const F = facade(p);
  const cells = layout(c.days);
  const weeks = (cells.at(-1)?.X ?? 0) + 1;
  const ox = g.left + (g.right - g.left - ((weeks + 7) * tw) / 2) / 2 + (7 * tw) / 2;
  const oy = top + H;
  // (u, v) 是地面上的坐标：u 沿着周往右下，v 沿着星期往左下；z 是离地面的高度
  const xy = (u: number, v: number, z = 0): Pt => [ox + ((u - v) * tw) / 2, oy + ((u + v) * tw) / 4 - z];

  const max = Math.max(1, ...c.days.map((d) => d.count));
  const ground: string[] = [];
  const blocks: string[] = [];
  let flicks = 0;
  const flick = (): number => flicks++;
  // 从远往近画：u + v 越小离观众越远
  for (const { d, X, Z } of [...cells].sort((a, b) => a.X + a.Z - (b.X + b.Z) || a.X - b.X)) {
    const [u0, u1, v0, v1] = [X + gap, X + 1 - gap, Z + gap, Z + 1 - gap];
    const base: Pt[] = [xy(u0, v0), xy(u1, v0), xy(u1, v1), xy(u0, v1)];
    const [, R, B, L] = base as [Pt, Pt, Pt, Pt];
    if (!d.count) {
      ground.push(`<polygon points="${base.map(pt).join(' ')}"/>`);
      continue;
    }
    const h = Math.max(6 * win, H * Math.sqrt(d.count / max));
    const lift = ([x, y]: Pt): Pt => [x, y - h];
    const roof = t.levels[Math.min(4, Math.max(1, d.level)) - 1] ?? t.accent;
    let shapes =
      polygon([L, B, lift(B), lift(L)], F.left) +
      polygon([B, R, lift(R), lift(B)], F.right) +
      polygon(base.map(lift), roof) +
      windows(d.date, [[L, B], [B, R]], h, win, p, F, flick);
    // 最高的几栋楼顶上有天线和闪烁的航空灯
    if (h >= H * 0.72) {
      const [x, y] = xy((u0 + u1) / 2, (v0 + v1) / 2, h);
      const tip = y - 10 * win;
      shapes += `<path d="M${r2(x)} ${r2(y)}V${r2(tip)}" stroke="${t.dim}" stroke-width="${r2(win)}" opacity=".7"/><circle class="beacon" cx="${r2(x)}" cy="${r2(tip)}" r="${r2(1.6 * win)}" fill="${t.city.beacon}"/>`;
    }
    blocks.push(`<g class="rise" ${delay(0.2 + X * 0.022)}>${shapes}</g>`);
  }

  // 地面靠近观众的两条边画成发光的线：左下那条是海岸线（见 landscape.ts），这里画右下那条
  const edge = `M${pt(xy(weeks, 7))}L${pt(xy(weeks, 0))}`;
  // 月份写在海岸线外面，星期写在右下那条边的外面
  const size = g.small - 2;
  const months: string[] = [];
  let lastX = -99;
  for (const { d, X } of cells) {
    if (!d.date.endsWith('-01') || X - lastX < (g.phone ? 7 : 3)) continue;
    lastX = X;
    const name = MONTHS[Number(d.date.slice(5, 7)) - 1] ?? '';
    const [x, y] = xy(X + 0.5, ROAD.coast + 0.15);
    // 最左边的月份放不下时往右挪，不压到窗口的边框
    const end = Math.max(x - 3, g.left + textWidth(name, size));
    months.push(
      `<text x="${r2(end)}" y="${r2(y + size + 2)}" text-anchor="end" class="faint" font-size="${size}">${name}</text>`,
    );
  }
  const weekdays = g.phone
    ? ''
    : WEEKDAY_LABELS.map(([z, s]) => {
        const [x, y] = xy(weeks, z + 0.5);
        return `<text x="${r2(x + 7)}" y="${r2(y + size - 1)}" class="faint" font-size="${size}">${s}</text>`;
      }).join('');

  return {
    tiles: `<g fill="${t.panel}">${ground.join('')}</g>
<path d="${edge}" fill="none" stroke="${t.accent}" stroke-width="3" opacity=".3" filter="url(#soft)"/>
<path d="${edge}" fill="none" stroke="${t.accent}" stroke-opacity=".45"/>`,
    blocks: blocks.join('\n'),
    labels: `<g class="in" ${delay(0.6)}>${months.join('')}${weekdays}</g>`,
    bottom: r2(xy(weeks, ROAD.coast + 0.15)[1] + size + 4),
    horizon: [xy(0, 7), xy(0, 0), xy(weeks, 0)],
    xy,
    weeks,
  };
}

/** 底部：日期范围、颜色图例，以及天色、天气和日出日落时间（手机版天色单独一行）；返回标记和最后一行的位置 */
function legend(g: Geo, c: Ctx, y: number): [string, number] {
  const size = g.small - 1;
  const sq = g.phone ? 9 : 10;
  const gap = 3;
  const colors = [t.panel, ...t.levels];
  const range = `${c.days[0]?.date ?? ''} – ${c.days.at(-1)?.date ?? ''}`;
  let sky = '';
  let rowY = y;
  if (c.sky) {
    sky = g.phone
      ? `<text x="${g.left}" y="${y}" class="dim" font-size="${size}">${skyText(c.sky)}</text>`
      : `<text x="${g.right}" y="${y}" text-anchor="end" class="dim" font-size="${size}">${skyText(c.sky)}</text>`;
    if (g.phone) rowY = y + size + 10;
  }
  // 图例平时靠右；桌面版右边要写天色时，接在日期范围后面
  const keyW = textWidth('less', size) + 8 + colors.length * (sq + gap) - gap + 8 + textWidth('more', size);
  const x0 = c.sky && !g.phone ? g.left + textWidth(range, size) + 32 : g.right - keyW;
  const sx = x0 + textWidth('less', size) + 8;
  const squares = colors
    .map((fill, i) => `<rect x="${r2(sx + i * (sq + gap))}" y="${rowY - sq + 1}" width="${sq}" height="${sq}" rx="2" fill="${fill}"/>`)
    .join('');
  const markup = `<g class="in" ${delay(1.2)}><text x="${g.left}" y="${rowY}" class="faint" font-size="${size}">${range}</text><text x="${r2(x0)}" y="${rowY}" class="faint" font-size="${size}">less</text>${squares}<text x="${r2(sx + colors.length * (sq + gap) - gap + 8)}" y="${rowY}" class="faint" font-size="${size}">more</text>${sky}</g>`;
  return [markup, rowY];
}

export async function contributions(g: Geo, c: Ctx): Promise<string> {
  const [head, headEnd] = summary(g, c, g.top);
  // 给飞机与高架之间留出独立的天空通道，不让入场位置落到桥下或上方统计里。
  const top = headEnd + (g.phone ? 26 : 40);
  const town = city(g, c, top);
  const right = town.horizon[2] ?? [g.right, top];
  const stage: Stage = g.phone
    ? {
        x0: g.x0,
        x1: g.x1,
        y0: top - 8,
        y1: town.bottom,
        horizon: town.horizon,
        high: [g.right - 30, top + 30],
        low: [g.right - 34, r2(right[1] - 70)],
        k: 0.6,
        clouds: [
          [g.right - 180, top + 22, 0.62],
          [g.right - 98, top + 62, 0.5],
          [g.right - 262, top + 10, 0.55],
          [g.right - 64, top + 104, 0.45],
        ],
        plane: { y: headEnd + 10, rise: 3 },
        stars: { x0: g.left + 100, x1: g.x1, y0: top, y1: top + 110, n: 32 },
      }
    : {
        x0: g.x0,
        x1: g.x1,
        y0: top - 12,
        y1: town.bottom,
        horizon: town.horizon,
        high: [g.right - 52, top + 48],
        low: [g.right - 64, r2(right[1] - 110)],
        k: 1,
        clouds: [
          [g.right - 360, top + 30, 1],
          [g.right - 210, top + 92, 0.8],
          [g.right - 500, top + 14, 0.85],
          [g.right - 130, top + 160, 0.7],
        ],
        plane: { y: headEnd + 14, rise: 6 },
        stars: { x0: g.left + 180, x1: g.x1, y0: top, y1: top + 190, n: 50 },
      };
  const tw = (g.phone ? PHONE_PROJ : DESKTOP_PROJ).tw;
  // 为城市右端的海滨广场和栈桥留出纵向空间，底部图例一起下移。
  const bottom = town.bottom + 32 * (tw / DESKTOP_PROJ.tw);
  stage.y1 = bottom;
  const sky = scene(c.sky, stage);
  const land = landscape(
    { xy: town.xy, weeks: town.weeks, k: tw / DESKTOP_PROJ.tw, x0: stage.x0, x1: stage.x1, y0: stage.y0, y1: stage.y1 },
    c.sky,
  );
  const [foot, footY] = legend(g, c, Math.round(bottom + (g.phone ? 20 : 24)));
  const h = up(footY + (g.phone ? 16 : 22));
  // 从后往前：天空、高架和车站、草地和树、海和滨海轨道、地块、楼、车船和电车、文字，最后是雨雪和雾
  const body = `${sectionTop(g, 'skyline --last 1year', '# one building per day')}
${head}
${sky.back}
${land.behind}
${land.coast}
${town.tiles}
${town.blocks}
${land.traffic}
${town.labels}
${sky.front}
${foot}`;
  return slice(g, h, body, {
    title: contributionsAlt(c),
    css: `${CSS}\n${sky.css}\n${land.css}`,
    defs: `${sky.defs}\n${land.defs}`,
  });
}
