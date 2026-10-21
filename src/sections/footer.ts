// 结尾：`$ exit` 之后连接断开（样式照着 Giorgi Kobaidze 的设计，见 NOTICE）；最后一张图画窗口的底边
import type { Ctx } from '../context.ts';
import { slice } from '../frame.ts';
import { delay, esc } from '../svg.ts';
import type { Geo } from '../theme.ts';

export const footerAlt = (c: Ctx): string =>
  `Connection to ${c.config.name} closed. Refreshed ${c.s.asOf} by GitHub Actions.`;

export async function footer(g: Geo, c: Ctx): Promise<string> {
  const y = g.phone ? 28 : 30;
  const step = 22;
  const body = `<g class="in" ${delay(0.1)}><text x="${g.left}" y="${y}" class="dim"><tspan class="ok" font-weight="700">$</tspan> exit</text></g>
<g class="in" ${delay(0.4)}><text x="${g.left}" y="${y + step}" class="dim">connection to <tspan class="ac">${esc(c.config.name)}</tspan> closed. <tspan class="faint">// EOF</tspan></text></g>`;
  return slice(g, 80, body, { title: footerAlt(c), bottom: true });
}
