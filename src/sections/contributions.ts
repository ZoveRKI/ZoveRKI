// 贡献天际线：过去一年每天一栋楼。每周一列从左往右排、越往右越远，一周七天从后往前排；
// 楼高按当天贡献数的平方根算，最忙的一天不会把其他楼压得看不见。
import type { Ctx } from '../context.ts';
import type { Day } from '../data.ts';
import { sectionTop, slice } from '../frame.ts';
import { daysBetween, delay, esc, MONTHS, monthDay, num, plural, r2, shade, textWidth, weekday } from '../svg.ts';
import { type Geo, theme as t, up } from '../theme.ts';

/** 投影参数：每过一周向右 cw、向上 rise；每过一天向右 dx、向下 dy；楼最高 H；gap 是楼与楼的间隙 */
type Proj = { cw: number; rise: number; dx: number; dy: number; H: number; gap: number };
const DESKTOP_PROJ: Proj = { cw: 12, rise: 3, dx: 6, dy: 6, H: 84, gap: 0.12 };
const PHONE_PROJ: Proj = { cw: 6.2, rise: 1.6, dx: 3.1, dy: 3.1, H: 46, gap: 0.14 };

const WEEKDAY_LABELS: [number, string][] = [
  [1, 'Mon'],
  [5, 'Fri'],
];

export const contributionsAlt = (c: Ctx): string =>
  `${num(c.total)} contributions in the last year. Current streak ${plural(c.streak.current, 'day')}, longest ${plural(c.streak.longest, 'day')}.`;

type Cell = { d: Day; X: number; Z: number };

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

/** 天际线本体；top 是最高的楼可能到达的位置，返回标记和底部位置 */
function skyline(g: Geo, c: Ctx, top: number): [string, number] {
  const P = g.phone ? PHONE_PROJ : DESKTOP_PROJ;
  const cells = layout(c.days);
  const weeks = (cells.at(-1)?.X ?? 0) + 1;
  const ox = g.left + (g.right - g.left - (weeks * P.cw + 7 * P.dx)) / 2;
  const oy = top + P.H + weeks * P.rise;
  const xy = (X: number, Z: number, Y = 0): [number, number] => [ox + X * P.cw + Z * P.dx, oy - X * P.rise + Z * P.dy - Y];
  const pt = (X: number, Z: number, Y = 0): string => xy(X, Z, Y).map(r2).join(',');
  const quad = (a: string, b: string, cc: string, d: string, fill = ''): string =>
    `<polygon points="${a} ${b} ${cc} ${d}"${fill ? ` fill="${fill}"` : ''}/>`;

  const max = Math.max(1, ...c.days.map((d) => d.count));
  const ground: string[] = [];
  const bars: string[] = [];
  // 先画远处的：靠后的一天先画，同一天里靠右（更远）的一周先画
  for (const { d, X, Z } of [...cells].sort((a, b) => a.Z - b.Z || b.X - a.X)) {
    const [x0, x1, z0, z1] = [X + P.gap, X + 1 - P.gap, Z + P.gap, Z + 1 - P.gap];
    if (!d.count) {
      ground.push(quad(pt(x0, z0), pt(x1, z0), pt(x1, z1), pt(x0, z1)));
      continue;
    }
    const h = Math.max(2, P.H * Math.sqrt(d.count / max));
    const roof = t.levels[Math.min(4, Math.max(1, d.level)) - 1] ?? t.accent;
    const front = quad(pt(x0, z1), pt(x1, z1), pt(x1, z1, h), pt(x0, z1, h), shade(roof, 0.66));
    const side = quad(pt(x0, z0), pt(x0, z1), pt(x0, z1, h), pt(x0, z0, h), shade(roof, 0.46));
    const lid = quad(pt(x0, z0, h), pt(x1, z0, h), pt(x1, z1, h), pt(x0, z1, h), roof);
    bars.push(`<g class="rise" ${delay(0.2 + X * 0.022)}>${front}${side}${lid}</g>`);
  }

  // 地面靠近观众的两条边画成发光的线
  const edge = `M${pt(0, 0)}L${pt(0, 7)}L${pt(weeks, 7)}`;
  const labelY = g.phone ? 12 : 16;
  const months: string[] = [];
  let lastX = -99;
  for (const { d, X } of cells) {
    if (!d.date.endsWith('-01') || X - lastX < (g.phone ? 7 : 3)) continue;
    lastX = X;
    const [x, y] = xy(X + 0.5, 7);
    months.push(
      `<text x="${r2(x)}" y="${r2(y + labelY)}" text-anchor="middle" class="faint" font-size="${g.small - 2}">${MONTHS[Number(d.date.slice(5, 7)) - 1]}</text>`,
    );
  }
  const weekdays = g.phone
    ? ''
    : WEEKDAY_LABELS.map(([z, s]) => {
        const [x, y] = xy(0, z + 0.5);
        return `<text x="${r2(x - 8)}" y="${r2(y + 4)}" text-anchor="end" class="faint" font-size="${g.small - 2}">${s}</text>`;
      }).join('');

  const markup = `<g fill="${t.panel}">${ground.join('')}</g>
<path d="${edge}" fill="none" stroke="${t.accent}" stroke-width="3" opacity=".3" filter="url(#soft)"/>
<path d="${edge}" fill="none" stroke="${t.accent}" stroke-opacity=".45"/>
${bars.join('\n')}
<g class="in" ${delay(0.6)}>${months.join('')}${weekdays}</g>`;
  return [markup, r2(oy + 7 * P.dy + labelY)];
}

/** 底部一行：左边是日期范围，右边是颜色图例 */
function legend(g: Geo, c: Ctx, y: number): string {
  const size = g.small - 1;
  const sq = g.phone ? 9 : 10;
  const gap = 3;
  const colors = [t.panel, ...t.levels];
  const xMore = g.right - textWidth('more', size);
  const x0 = xMore - 8 - colors.length * (sq + gap) + gap;
  const squares = colors
    .map((fill, i) => `<rect x="${r2(x0 + i * (sq + gap))}" y="${y - sq + 1}" width="${sq}" height="${sq}" rx="2" fill="${fill}"/>`)
    .join('');
  const range = `${c.days[0]?.date ?? ''} – ${c.days.at(-1)?.date ?? ''}`;
  return `<g class="in" ${delay(1.2)}><text x="${g.left}" y="${y}" class="faint" font-size="${size}">${range}</text><text x="${r2(x0 - 8)}" y="${y}" text-anchor="end" class="faint" font-size="${size}">less</text>${squares}<text x="${r2(xMore)}" y="${y}" class="faint" font-size="${size}">more</text></g>`;
}

export async function contributions(g: Geo, c: Ctx): Promise<string> {
  const [head, headEnd] = summary(g, c, g.top);
  const [sky, skyEnd] = skyline(g, c, headEnd + (g.phone ? 20 : 30));
  const legendY = Math.round(skyEnd + (g.phone ? 24 : 30));
  const h = up(legendY + (g.phone ? 16 : 22));
  const body = `${sectionTop(g, 'skyline --last 12mo', '# one building per day')}
${head}
${sky}
${legend(g, c, legendY)}`;
  return slice(g, h, body, { title: contributionsAlt(c) });
}
