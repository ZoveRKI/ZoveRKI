// 根据 data/snapshot.json 渲染 assets/ 下的 SVG 切片和 README.md。
// 输出只取决于数据、字体和代码：数据没变时生成的文件一字不差，定时任务就不会产生空提交。
//
//   node src/render.ts [--data data/snapshot.json] [--out .]
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { config } from './config.ts';
import { buildContext, type Ctx } from './context.ts';
import { readSnapshot, SNAPSHOT_PATH } from './data.ts';
import { uncovered } from './font.ts';
import { Page, type Pair } from './page.ts';
import { activity, activityAlt } from './sections/activity.ts';
import { contributions, contributionsAlt } from './sections/contributions.ts';
import { footer, footerAlt } from './sections/footer.ts';
import { header, headerAlt } from './sections/header.ts';
import { languages, languagesAlt } from './sections/languages.ts';
import { linkButton } from './sections/links.ts';
import { projectAlt, projectRow, projectsHead } from './sections/projects.ts';
import { stack, stackAlt } from './sections/stack.ts';
import { DESKTOP, type Geo, PHONE } from './theme.ts';

/** 同一张图的桌面版和手机版 */
const both = (draw: (g: Geo) => Promise<string>): Promise<Pair> => Promise.all([draw(DESKTOP), draw(PHONE)]);

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** 按配置的顺序拼出整个主页；缺数据的板块直接跳过 */
export async function renderPage(c: Ctx): Promise<Page> {
  const { login, branch, links } = c.config;
  const page = new Page(`https://github.com/${login}/${login}/raw/${branch}/assets`);

  page.add('header.svg', await both((g) => header(g, c)), { alt: headerAlt(c) });
  for (const [k, l] of links.entries()) {
    page.add(`links/${k + 1}.svg`, await both((g) => linkButton(g, l, k, links.length)), {
      alt: l.label,
      href: l.url,
      width: `${Number((100 / links.length).toFixed(4))}%`,
      sameRow: k > 0,
    });
  }

  for (const section of c.config.sections) {
    if (section === 'contributions' && c.days.length) {
      page.add('contributions.svg', await both((g) => contributions(g, c)), { alt: contributionsAlt(c) });
    } else if (section === 'activity' && c.overview) {
      page.add('activity.svg', await both((g) => activity(g, c)), { alt: activityAlt(c) });
    } else if (section === 'languages' && c.langs.length) {
      page.add('languages.svg', await both((g) => languages(g, c)), { alt: languagesAlt(c) });
    } else if (section === 'stack' && c.techStack.length) {
      page.add('stack.svg', await both((g) => stack(g, c)), { alt: stackAlt(c) });
    } else if (section === 'projects' && c.projects.length) {
      page.add('projects.svg', await both((g) => projectsHead(g, c)), { alt: 'Projects' });
      for (const [i, p] of c.projects.entries()) {
        page.add(`projects/${slug(p.name)}.svg`, await both((g) => projectRow(g, p, i)), {
          alt: projectAlt(p),
          href: p.url,
        });
      }
    }
  }

  page.add('footer.svg', await both((g) => footer(g, c)), {
    alt: footerAlt(c),
    href: `https://github.com/${login}/${login}`,
  });
  return page;
}

export async function writePage(page: Page, out: string): Promise<void> {
  // 先清空 assets/，去掉的板块不会留下旧图片
  await rm(join(out, 'assets'), { recursive: true, force: true });
  for (const [name, svg] of page.files) {
    const path = join(out, 'assets', name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, svg);
  }
  await writeFile(join(out, 'README.md'), page.readme());
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      data: { type: 'string', default: SNAPSHOT_PATH },
      out: { type: 'string', default: '.' },
    },
  });
  const s = await readSnapshot(values.data);
  if (!s) throw new Error(`没有找到 ${values.data}，先运行 pnpm fetch-data`);
  if (s.login !== config.login) console.warn(`warning: 数据是 ${s.login} 的，配置里是 ${config.login}，先重新抓取数据`);
  const page = await renderPage(buildContext(config, s));
  await writePage(page, values.out);
  console.log(`已生成 ${page.files.size} 张 SVG 和 README.md（输出目录 ${values.out}）`);
  if (uncovered.size) {
    console.warn(`提示：内嵌字体里没有这些字符，会用访客系统里的字体显示：${[...uncovered].join(' ')}`);
  }
}

if (import.meta.main) await main();
