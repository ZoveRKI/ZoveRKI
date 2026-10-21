// 主页由一行行图片拼成。每次 add() 记下桌面版和手机版两张 SVG，并在当前行追加一个 <picture>：
// 页面窄于 600px 时换成手机版。同一行的图片之间不能有空白，宽度加起来正好 100%。
import { esc } from './svg.ts';

export type Pair = [desktop: string, phone: string];

const PHONE_QUERY = '(max-width: 600px)';

type AddOpts = {
  /** 图片的替代文字 */
  alt: string;
  /** 占整行宽度的比例，默认 100% */
  width?: string;
  /** 点击后跳转的地址 */
  href?: string;
  /** 接在上一张图的同一行 */
  sameRow?: boolean;
};

export class Page {
  /** 文件名 → SVG 内容，手机版在 phone/ 下 */
  readonly files = new Map<string, string>();
  private readonly rows: string[][] = [];
  /** 图片目录的绝对地址：<source srcset> 里的相对路径 GitHub 不会改写，只能写绝对地址 */
  private readonly raw: string;

  constructor(raw: string) {
    this.raw = raw;
  }

  add(file: string, [desktop, phone]: Pair, o: AddOpts): void {
    this.files.set(file, desktop);
    this.files.set(`phone/${file}`, phone);
    // alt 里的空行会提前结束 README 里的 HTML 块
    const alt = esc(o.alt.replace(/\s+/g, ' ').trim());
    const img = `<picture><source media="${PHONE_QUERY}" srcset="${this.raw}/phone/${file}"><img src="./assets/${file}" width="${o.width ?? '100%'}" align="top" alt="${alt}"></picture>`;
    const html = o.href ? `<a href="${esc(o.href)}">${img}</a>` : img;
    const last = this.rows.at(-1);
    if (o.sameRow && last) last.push(html);
    else this.rows.push([html]);
  }

  readme(): string {
    return `<!-- 由 \`pnpm readme\` 生成：要改内容请修改 profile.config.ts 或 src/ 后重新生成，不要直接改这个文件。 -->
<p align="center">
${this.rows.map((r) => r.join('')).join('\n')}
</p>
`;
  }
}
