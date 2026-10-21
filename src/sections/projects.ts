// 项目：先是一张 `ls -l` 风格的标题，下面每个项目单独一张图，整张图点击后跳到仓库
import type { Ctx } from '../context.ts';
import { arrow, fork, sectionTop, slice, star } from '../frame.ts';
import type { Project } from '../metrics.ts';
import { delay, esc, num, plural, r2, textWidth, truncate, wrap } from '../svg.ts';
import { type Geo, theme as t, up } from '../theme.ts';

export const projectAlt = (p: Project): string => `${p.name}: ${p.description}`;

export async function projectsHead(g: Geo, c: Ctx): Promise<string> {
  const body = sectionTop(g, 'ls -l ~/projects', `# ${plural(c.projects.length, 'project')}`);
  return slice(g, g.phone ? 60 : 80, body, { title: 'Projects' });
}

/** 语言、star、fork 三项，从 x 开始往右排；返回标记和总宽度 */
function meta(g: Geo, p: Project, x: number, y: number): [string, number] {
  const size = g.small;
  const parts: string[] = [];
  let cx = x;
  if (p.language) {
    parts.push(
      `<circle cx="${r2(cx + 5)}" cy="${r2(y - 4.5)}" r="4.5" fill="${p.color}"/><text x="${r2(cx + 15)}" y="${y}" class="dim" font-size="${size}">${esc(p.language)}</text>`,
    );
    cx += 15 + textWidth(p.language, size) + 16;
  }
  const stars = num(p.stars);
  parts.push(`${star(cx + 6, y - 4.5, 6, t.yellow)}<text x="${r2(cx + 16)}" y="${y}" class="dim" font-size="${size}">${stars}</text>`);
  cx += 16 + textWidth(stars, size) + 16;
  const forks = num(p.forks);
  parts.push(`${fork(cx + 6, y - 4.5, 12, t.dim)}<text x="${r2(cx + 16)}" y="${y}" class="dim" font-size="${size}">${forks}</text>`);
  cx += 16 + textWidth(forks, size);
  return [parts.join(''), cx - x];
}

export async function projectRow(g: Geo, p: Project, i: number): Promise<string> {
  const x = g.left + 18;
  const nameSize = g.phone ? 16 : 18;
  const nameY = g.phone ? 30 : 34;
  const descSize = g.phone ? 13 : 14;
  const descStep = descSize + 6;

  // 桌面版的语言、star、fork 靠右和名字同一行；手机版放到名字下面
  let metaMarkup: string;
  let nameMax: number;
  let descY: number;
  if (g.phone) {
    metaMarkup = meta(g, p, x, nameY + 24)[0];
    nameMax = g.right - x - 24;
    descY = nameY + 50;
  } else {
    const w = meta(g, p, 0, nameY)[1];
    metaMarkup = meta(g, p, g.right - w, nameY)[0];
    nameMax = g.right - x - w - 48;
    descY = nameY + 28;
  }
  const name = truncate(p.name, nameSize, nameMax);
  const lines = wrap(p.description, descSize, g.right - x).slice(0, g.phone ? 4 : 3);
  const info = [p.updated ? `updated ${p.updated}` : '', ...p.topics.slice(0, 4).map((s) => `#${s}`)]
    .filter(Boolean)
    .join(' · ');
  const infoY = descY + (lines.length - 1) * descStep + (g.phone ? 24 : 26);
  const h = up(infoY + (g.phone ? 16 : 18));

  const body = `${i ? `<line x1="${g.left}" y1="0.5" x2="${g.right}" y2="0.5" stroke="${t.line}" stroke-dasharray="2 4"/>` : ''}
<rect x="${g.left}" y="12" width="3" height="${h - 24}" rx="1.5" fill="${p.color}"/>
<g class="in" ${delay(0.15)}>
<text x="${x}" y="${nameY}" font-size="${nameSize}" font-weight="700" class="ac">${esc(name)}</text>
${arrow(x + textWidth(name, nameSize) + 10, nameY - nameSize * 0.62, nameSize * 0.5, t.accent)}
${metaMarkup}
</g>
<g class="in" ${delay(0.3)}>${lines.map((line, k) => `<text x="${x}" y="${descY + k * descStep}" font-size="${descSize}">${esc(line)}</text>`).join('')}</g>
${info ? `<g class="in" ${delay(0.4)}><text x="${x}" y="${infoY}" class="faint" font-size="${g.small - 1}">${esc(truncate(info, g.small - 1, g.right - x))}</text></g>` : ''}`;
  return slice(g, h, body, { title: projectAlt(p) });
}
