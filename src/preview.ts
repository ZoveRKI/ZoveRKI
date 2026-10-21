// 本地预览：用接近 GitHub 主页的版式显示生成好的 README；窗口窄于 600px 时会换成手机版图片。
//
//   node src/preview.ts [--root .] [--port 4173]
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { config } from './config.ts';

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

function page(readme: string): string {
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
nav{display:flex;justify-content:space-between;margin-bottom:12px;color:#9198a1}
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
<nav><span>${config.login} / README.md</span><button onclick="document.body.classList.toggle('light')">light / dark</button></nav>
<div class="box">
${readme.replaceAll(raw, '/')}
</div>
</main>
</body>
</html>`;
}

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    if (path === '/') {
      const html = page(await readFile(join(root, 'README.md'), 'utf8'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(html);
      return;
    }
    // 只提供 assets/ 下的图片
    const file = resolve(root, `.${path}`);
    if (!file.startsWith(assets) || !file.endsWith('.svg')) throw new Error('not found');
    const svg = await readFile(file);
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' });
    res.end(svg);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
}).listen(Number(values.port), () => {
  console.log(`预览地址：http://localhost:${values.port}（目录 ${root}）`);
});
