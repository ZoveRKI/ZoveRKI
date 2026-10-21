// 结尾：`$ exit` 之后断开连接；最后一张图画窗口的底边
import type { Ctx } from '../context.ts';
import { slice } from '../frame.ts';
import { delay, esc } from '../svg.ts';
import type { Geo } from '../theme.ts';

export const footerAlt = (c: Ctx): string =>
  `Refreshed ${c.s.asOf} by GitHub Actions. Source: github.com/${c.config.login}/${c.config.login}`;

export async function footer(g: Geo, c: Ctx): Promise<string> {
  const { login } = c.config;
  const y = g.phone ? 32 : 40;
  const step = g.phone ? 20 : 22;
  const closed = 'Connection to github.com closed.';
  const source = `refreshed ${c.s.asOf} · source: ${login}/${login}`;
  // 手机版一行放不下，拆成两行
  const lines = g.phone ? [closed, source] : [`${closed} · ${source}`];
  const body = `<g class="in" ${delay(0.1)}><text x="${g.left}" y="${y}"><tspan class="ok" font-weight="700">$</tspan> exit</text></g>
<g class="in" ${delay(0.35)}><text x="${g.left}" y="${y + step}" class="dim" font-size="${g.small}">logout</text></g>
<g class="in" ${delay(0.55)}>${lines.map((s, i) => `<text x="${g.left}" y="${y + step * (i + 2)}" class="faint" font-size="${g.small}">${esc(s)}</text>`).join('')}</g>`;
  return slice(g, 120, body, { title: footerAlt(c), bottom: true });
}
