// 技术栈：`tree` 风格的目录树，一组一行，组名后面是这一组的条目，一行放不下时换行。
// 条目和语言统计里的某种语言同名时，前面的小方块用那种语言的颜色，和上面语言占比的图例对得上。
import type { Ctx } from '../context.ts';
import { sectionTop, slice } from '../frame.ts';
import type { StackItem } from '../metrics.ts';
import { delay, esc, num, plural, r2, textWidth, truncate } from '../svg.ts';
import { type Geo, theme as t, up } from '../theme.ts';

export const stackAlt = (c: Ctx): string =>
  `Tech stack: ${c.techStack.map((s) => `${s.name}: ${s.items.map((i) => i.name).join(', ')}`).join('; ')}.`;

/** 和 tree 命令最后一行的统计一样：几个目录、几个文件 */
function summary(c: Ctx): string {
  const dirs = c.techStack.length;
  const files = c.techStack.reduce((n, s) => n + s.items.length, 0);
  return `# ${num(dirs)} ${dirs === 1 ? 'directory' : 'directories'}, ${plural(files, 'file')}`;
}

/** 一个标签：x 从条目区的左边算起，line 是组内的第几行 */
type Chip = { item: StackItem; dot: string | null; x: number; w: number; line: number };

export async function stack(g: Geo, c: Ctx): Promise<string> {
  const size = g.phone ? g.small : g.small + 1;
  const chipH = g.phone ? 22 : 28;
  const padX = g.phone ? 8 : 12;
  const sq = g.phone ? 7 : 8;
  const sqGap = g.phone ? 6 : 7;
  const gap = g.phone ? 6 : 8;
  const step = g.phone ? 30 : 38;
  /** 文字基线相对行中心的偏移，让大写字母垂直居中 */
  const base = (s: number) => Math.round(s * 0.36);

  // 树干在第一个字符的中间，和 tree 命令的输出一样；坐标落在半像素上，1px 的线才清晰
  const trunk = g.left + 4.5;
  const labelX = trunk + (g.phone ? 16 : 22);
  const labels = c.techStack.map((s) => truncate(s.name, g.small, (g.right - labelX) * 0.4));
  const labelW = Math.max(...labels.map((l) => textWidth(`${l}/`, g.small)));
  const chipsX = Math.round(labelX + labelW + (g.phone ? 12 : 24));
  const room = g.right - chipsX;

  // 先按顶端对齐排好，最后整体往下挪，让上下留白差不多
  const rootY = g.top + 6;
  let cy = rootY + (g.phone ? 28 : 32);
  const groups = c.techStack.map((s, i) => {
    // 一组里只要有条目带语言颜色，其余条目也画一个灰色小方块，这一行才整齐
    const dotted = s.items.some((it) => it.color);
    let x = 0;
    let line = 0;
    const chips: Chip[] = s.items.map((item) => {
      const dot = item.color ?? (dotted ? t.faint : null);
      const w = Math.min(room, Math.ceil(padX * 2 + (dot ? sq + sqGap : 0) + textWidth(item.name, size)));
      if (x && x + w > room) {
        x = 0;
        line++;
      }
      const chip = { item, dot, x, w, line };
      x += w + gap;
      return chip;
    });
    const row = { label: labels[i] ?? s.name, cy, chips };
    cy += (line + 1) * step;
    return row;
  });
  const lastY = groups.at(-1)?.cy ?? rootY;
  const natural = cy - step + chipH / 2 + (g.phone ? 26 : 30);
  const h = up(natural);
  const dy = Math.floor((h - natural) / 2);

  const branch = g.phone ? 10 : 13;
  const tree = `<path d="M${trunk} ${rootY + 7}V${lastY + 0.5}${groups.map((r) => `M${trunk} ${r.cy + 0.5}H${trunk + branch}`).join('')}" fill="none" stroke="${t.border}"/>`;

  const rows = groups
    .map((r, i) => {
      const d = 0.2 + i * 0.07;
      const label = `<text x="${r2(labelX)}" y="${r.cy + base(g.small)}" font-size="${g.small}" class="ac2">${esc(r.label)}<tspan class="faint">/</tspan></text>`;
      const chips = r.chips.map((ch, k) => {
        const x = chipsX + ch.x;
        const y = r.cy + ch.line * step;
        const tx = x + padX + (ch.dot ? sq + sqGap : 0);
        const name = truncate(ch.item.name, size, x + ch.w - padX - tx);
        const dot = ch.dot
          ? `<rect x="${x + padX}" y="${r2(y - sq / 2)}" width="${sq}" height="${sq}" rx="2" fill="${ch.dot}"/>`
          : '';
        return `<g class="in" ${delay(d + 0.05 + k * 0.03)}><rect x="${x + 0.5}" y="${r2(y - chipH / 2 + 0.5)}" width="${ch.w - 1}" height="${chipH - 1}" rx="3" fill="${t.panel}" stroke="${t.border}"/>${dot}<text x="${r2(tx)}" y="${y + base(size)}" font-size="${size}">${esc(name)}</text></g>`;
      });
      return `<g class="in" ${delay(d)}>${label}</g>\n${chips.join('')}`;
    })
    .join('\n');

  const body = `${sectionTop(g, 'tree ~/stack', summary(c))}
<g transform="translate(0 ${dy})">
<g class="in" ${delay(0.15)}><text x="${g.left}" y="${rootY}" font-weight="700" class="ac">~/stack</text>
${tree}</g>
${rows}
</g>`;
  return slice(g, h, body, { title: stackAlt(c) });
}
