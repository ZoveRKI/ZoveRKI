// 本地预览：用接近 GitHub 主页的版式显示生成好的 README；窗口窄于 600px 时会换成手机版图片。
// 右上角的下拉框（也就是网址后面的 ?phase=dusk&weather=rain）可以换贡献城市的时段和天气：
// 这时按快照在内存里重新生成整页，不写任何文件。
//
//   node src/preview.ts [--root .] [--port 4173]
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { config } from './config.ts';
import { buildContext } from './context.ts';
import { type Phase, PHASES, readSnapshot, SNAPSHOT_PATH, type Weather, WEATHERS } from './data.ts';
import type { Page } from './page.ts';
import { renderPage } from './render.ts';
import { previewSky } from './sky.ts';

const { values } = parseArgs({
  options: {
    root: { type: 'string', default: '.' },
    port: { type: 'string', default: process.env.PORT ?? '4173' },
  },
});
const root = resolve(values.root);
const assets = join(root, 'assets') + sep;
// README 里手机版图片用的是 GitHub 上的绝对地址，预览时换成本地文件
const raw = `https://github.com/${config.login}/${config.login}/raw/${config.branch}/`;

/** 网址里指定的时段和天气，只认清单里有的值 */
type SkyQuery = { phase?: Phase; weather?: Weather };

function skyQuery(url: URL): SkyQuery {
  return {
    phase: PHASES.find((p) => p === url.searchParams.get('phase')),
    weather: WEATHERS.find((w) => w === url.searchParams.get('weather')),
  };
}

/** 去掉空值的查询字符串，比如 phase=dusk&weather=rain；什么都没指定时是空字符串 */
function queryOf(q: SkyQuery): string {
  const params = new URLSearchParams();
  if (q.phase) params.set('phase', q.phase);
  if (q.weather) params.set('weather', q.weather);
  return params.toString();
}

/** 按指定天色在内存里生成的整页，键是查询字符串。打开首页时读最新的快照重新生成，图片请求沿用 */
const pages = new Map<string, Promise<Page>>();

function pageFor(q: SkyQuery, query: string, fresh: boolean): Promise<Page> {
  let p = pages.get(query);
  if (!p || fresh) {
    p = (async () => {
      const s = await readSnapshot(join(root, SNAPSHOT_PATH));
      if (!s) throw new Error(`没有找到 ${SNAPSHOT_PATH}，先运行 pnpm fetch-data`);
      if (!config.location) throw new Error('换时段和天气要先在 profile.config.ts 里配置 location');
      s.sky = previewSky(s.sky, config.location, s.asOf, q.phase, q.weather);
      return renderPage(buildContext(config, s));
    })();
    pages.set(query, p);
  }
  return p;
}

function page(readme: string, q: SkyQuery, query: string): string {
  // 换了天色时，图片地址也带上同样的参数
  let body = readme.replaceAll(raw, '/');
  if (query) body = body.replace(/((?:src|srcset)="[^"]+\.svg)"/g, `$1?${query}"`);
  const select = (name: string, list: readonly string[], value?: string): string =>
    `<select name="${name}" onchange="this.form.submit()"><option value="">${name}: as fetched</option>${list.map((v) => `<option${v === value ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Profile preview</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#0d1117;color:#e6edf3;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif}
body.light{color-scheme:light;background:#fff;color:#1f2328}
main{max-width:880px;margin:0 auto;padding:24px 16px}
nav{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;margin-bottom:12px;color:#9198a1}
nav form{display:inline;margin-right:16px}
nav select{font:inherit;color:inherit;background:none;border:1px solid #3d444d;border-radius:6px;padding:0 4px}
.light nav select{border-color:#d1d9e0}
nav button{font:inherit;color:#4493f8;background:none;border:0;cursor:pointer;padding:0}
.box{border:1px solid #3d444d;border-radius:6px;padding:24px}
.light .box{border-color:#d1d9e0}
.box p{margin:0}
.box img{max-width:100%;box-sizing:content-box}
@media (max-width:600px){main{padding:16px 8px}.box{padding:16px}}
</style>
</head>
<body>
<main>
<nav><span>${config.login} / README.md</span><span><form>${select('phase', PHASES, q.phase)} ${select('weather', WEATHERS, q.weather)}</form><button onclick="document.body.classList.toggle('light')">light / dark</button></span></nav>
<div class="box">
${body}
</div>
</main>
</body>
</html>`;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    const q = skyQuery(url);
    const query = queryOf(q);
    if (path === '/') {
      const readme = query ? (await pageFor(q, query, true)).readme() : await readFile(join(root, 'README.md'), 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(page(readme, q, query));
      return;
    }
    // 只提供 assets/ 下的图片
    const file = resolve(root, `.${path}`);
    if (!file.startsWith(assets) || !file.endsWith('.svg')) throw new Error('not found');
    const svg = query
      ? (await pageFor(q, query, false)).files.get(file.slice(assets.length).split(sep).join('/'))
      : await readFile(file);
    if (svg === undefined) throw new Error('not found');
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' });
    res.end(svg);
  } catch (e) {
    // 文件不存在算 404；按指定天色生成失败（比如没有配置 location）时把原因显示出来
    const err = e as NodeJS.ErrnoException;
    const missing = err.message === 'not found' || err.code === 'ENOENT';
    res.writeHead(missing ? 404 : 500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(missing ? 'not found' : err.message);
  }
}).listen(Number(values.port), () => {
  console.log(`预览地址：http://localhost:${values.port}（目录 ${root}）`);
});
