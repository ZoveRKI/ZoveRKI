// 活动概览：和 GitHub 主页上的 Activity overview 一样，用十字图显示提交、代码评审、issue、PR 各占多少；
// 旁边是提交最多的仓库和一周七天的贡献分布。细分数据只有 GraphQL 能拿到，没有数据时不显示这个板块。
import type { Ctx } from '../context.ts';
import { label, sectionTop, slice } from '../frame.ts';
import type { OverviewItem } from '../metrics.ts';
import { delay, esc, mix, num, plural, r2, truncate } from '../svg.ts';
import { type Geo, theme as t, up } from '../theme.ts';

/** 四个方向：左边提交、上面代码评审、右边 issue、下面 PR，和 GitHub 的布局一致 */
const DIRS: Record<OverviewItem['key'], [number, number]> = {
  commits: [-1, 0],
  reviews: [0, -1],
  issues: [1, 0],
  prs: [0, 1],
};
const DAYS = 'SMTWTFS';
/** 最多列出几个公开仓库 */
const MAX_REPOS = 5;

const CSS = `@keyframes zpop{from{opacity:0;transform:scale(0)}}
.pop{animation:zpop .9s cubic-bezier(.2,.8,.2,1) both}`;

export const activityAlt = (c: Ctx): string =>
  `Activity overview: ${(c.overview ?? []).map((i) => `${i.pct}% ${i.label.toLowerCase()}`).join(', ')}.` +
  (c.privateCommits ? ` ${plural(c.privateCommits, 'commit')} in private repos.` : '');

function cross(g: Geo, cx: number, cy: number, L: number, items: OverviewItem[]): string {
  const rings = [0.25, 0.5, 0.75, 1]
    .map((f) => {
      const r = L * f;
      return `<path d="M${cx} ${r2(cy - r)}L${r2(cx + r)} ${cy}L${cx} ${r2(cy + r)}L${r2(cx - r)} ${cy}Z" fill="none" stroke="${t.line}"${f < 1 ? ' stroke-dasharray="2 3"' : ''}/>`;
    })
    .join('');
  const axes = `<path d="M${cx - L} ${cy}H${cx + L}M${cx} ${cy - L}V${cy + L}" stroke="${t.border}"/>`;
  const pts = items.map((i) => {
    const [dx, dy] = DIRS[i.key];
    // 半径按平方根算：某一项占了绝大多数时，其余几项也看得出大小；准确数字看旁边的百分比
    const r = Math.max(4, L * Math.sqrt(i.pct / 100));
    return [cx + dx * r, cy + dy * r];
  });
  const poly = pts.map(([x = 0, y = 0]) => `${r2(x)},${r2(y)}`).join(' ');
  const labels = items
    .map((i) => {
      const [dx, dy] = DIRS[i.key];
      if (dy) {
        // 上下两个方向：文字居中
        const yPct = dy < 0 ? cy - L - 10 : cy + L + 22;
        const yLabel = dy < 0 ? cy - L - 26 : cy + L + 38;
        return `<text x="${cx}" y="${yPct}" text-anchor="middle" font-weight="700">${i.pct}%</text><text x="${cx}" y="${yLabel}" text-anchor="middle" class="faint" font-size="${g.small}">${esc(i.label)}</text>`;
      }
      const x = cx + dx * (L + 12);
      const anchor = dx < 0 ? 'end' : 'start';
      return `<text x="${x}" y="${cy - 3}" text-anchor="${anchor}" font-weight="700">${i.pct}%</text><text x="${x}" y="${cy + 14}" text-anchor="${anchor}" class="faint" font-size="${g.small}">${esc(i.label)}</text>`;
    })
    .join('');
  return `<g class="in" ${delay(0.2)}>${rings}${axes}${labels}</g>
<g class="pop" style="transform-origin:${cx}px ${cy}px;animation-delay:.4s">
<polygon points="${poly}" fill="none" stroke="${t.accent}" stroke-width="3" opacity=".5" filter="url(#soft)"/>
<polygon points="${poly}" fill="${t.accent}" fill-opacity=".18" stroke="${t.accent}" stroke-width="1.6" stroke-linejoin="round"/>
${pts.map(([x = 0, y = 0]) => `<circle cx="${r2(x)}" cy="${r2(y)}" r="3.2" fill="${t.bright}"/>`).join('')}
</g>`;
}

/** 仓库列表占几行：公开仓库最多 MAX_REPOS 行（一个都没有时是一行提示），有私有提交时再加一行 */
const repoLines = (c: Ctx): number => Math.max(1, Math.min(MAX_REPOS, c.topRepos.length)) + (c.privateCommits ? 1 : 0);

/**
 * 提交最多的公开仓库：名字、提交数和一条比例条。私有仓库不显示名字，只在最后一行用灰色小字给出提交总数。
 * y 是第一行的基线。
 */
function repos(g: Geo, x: number, y: number, w: number, c: Ctx): string {
  const shown = c.topRepos.slice(0, MAX_REPOS);
  const max = Math.max(1, ...shown.map((r) => r.commits));
  const step = g.phone ? 30 : 32;
  const prefix = `${c.config.login.toLowerCase()}/`;
  const lines = shown.map((r, i) => {
      const yy = y + i * step;
      const own = r.name.toLowerCase().startsWith(prefix) ? r.name.slice(prefix.length) : r.name;
      const bar = r2(Math.max(3, (w * r.commits) / max));
      return `<g class="in" ${delay(0.3 + i * 0.08)}><text x="${x}" y="${yy}" font-size="${g.small}">${esc(truncate(own, g.small, w - 56))}</text><text x="${x + w}" y="${yy}" text-anchor="end" class="dim" font-size="${g.small}">${num(r.commits)}</text><rect x="${x}" y="${yy + 7}" width="${w}" height="3" rx="1.5" fill="${t.line}"/><rect x="${x}" y="${yy + 7}" width="${bar}" height="3" rx="1.5" fill="${t.accent2}" class="grow" ${delay(0.45 + i * 0.08)}/></g>`;
  });
  if (!shown.length) lines.push(`<text x="${x}" y="${y}" class="faint" font-size="${g.small}">no public commits yet</text>`);
  if (c.privateCommits) {
    const note = truncate(`+ ${plural(c.privateCommits, 'commit')} in private repos`, g.small - 1, w);
    const yy = y + Math.max(1, shown.length) * step;
    lines.push(
      `<g class="in" ${delay(0.35 + shown.length * 0.08)}><text x="${x}" y="${yy}" class="faint" font-size="${g.small - 1}">${esc(note)}</text></g>`,
    );
  }
  return lines.join('\n');
}

/** 一周七天的贡献分布；top 是柱子区域的顶部，h 是柱子最高的高度 */
function rhythm(g: Geo, x: number, top: number, w: number, h: number, totals: number[]): string {
  const gap = 8;
  const bw = (w - gap * 6) / 7;
  const max = Math.max(1, ...totals);
  const best = totals.indexOf(max);
  return totals
    .map((n, i) => {
      const bh = Math.max(2, (h * n) / max);
      const bx = x + i * (bw + gap);
      const fill = i === best ? t.accent2 : mix(t.accent2, t.bg, 0.5);
      const value =
        i === best && n
          ? `<g class="in" ${delay(0.9)}><text x="${r2(bx + bw / 2)}" y="${r2(top + h - bh - 7)}" text-anchor="middle" class="dim" font-size="${g.small - 1}">${num(n)}</text></g>`
          : '';
      return `<rect x="${r2(bx)}" y="${r2(top + h - bh)}" width="${r2(bw)}" height="${r2(bh)}" rx="2" fill="${fill}" class="rise" ${delay(0.3 + i * 0.06)}/>${value}<text x="${r2(bx + bw / 2)}" y="${top + h + 18}" text-anchor="middle" class="faint" font-size="${g.small - 1}">${DAYS[i]}</text>`;
    })
    .join('');
}

export async function activity(g: Geo, c: Ctx): Promise<string> {
  const items = c.overview ?? [];
  let body: string;
  let h: number;
  if (g.phone) {
    // 手机版：三个面板上下排列
    const cx = g.w / 2;
    const cy = g.top + 122;
    const L = 58;
    const reposTitle = cy + L + 72;
    const rhythmTitle = reposTitle + 30 + (repoLines(c) - 1) * 30 + 46;
    const rhythmTop = rhythmTitle + 34;
    h = up(rhythmTop + 100 + 34);
    body = `${label(g, g.left, g.top + 4, 'overview')}
${cross(g, cx, cy, L, items)}
${label(g, g.left, reposTitle, 'top repositories')}
${repos(g, g.left, reposTitle + 30, g.right - g.left, c)}
${label(g, g.left, rhythmTitle, 'weekly rhythm')}
${rhythm(g, g.left, rhythmTop, g.right - g.left, 100, c.weekdays)}`;
  } else {
    // 桌面版：三个面板左右排列
    const titleY = g.top + 8;
    body = `${label(g, g.left, titleY, 'overview')}
${cross(g, g.left + 150, 202, 64, items)}
${label(g, 372, titleY, 'top repositories')}
${repos(g, 372, 126, 230, c)}
${label(g, 650, titleY, 'weekly rhythm')}
${rhythm(g, 650, 128, g.right - 650, 140, c.weekdays)}`;
    h = 320;
  }
  return slice(g, h, `${sectionTop(g, 'gh activity --overview', '# last 12 months')}\n${body}`, {
    title: activityAlt(c),
    css: CSS,
  });
}
