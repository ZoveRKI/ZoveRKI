import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveConfig } from './config.ts';
import { buildContext } from './context.ts';
import type { Level, Snapshot } from './data.ts';
import { renderPage } from './render.ts';
import { UNIT } from './theme.ts';

const config = resolveConfig({
  login: 'octo',
  tagline: 'A deliberately long tagline for the test, long enough that it has to wrap onto a second line.',
  stack: ['Rust', 'Go', 'TypeScript', 'Python', 'Ruby'],
  links: [
    { label: 'Blog', url: 'https://example.com', note: 'example.com' },
    { label: 'Mastodon', url: 'https://example.social/@octo' },
    { label: 'Email', url: 'mailto:octo@example.com' },
  ],
  projects: [{ repo: 'alpha' }, { repo: 'missing', description: '配置里写了、但 GitHub 上找不到的项目' }],
});

function snapshot(): Snapshot {
  const start = Date.UTC(2025, 9, 19);
  const days = Array.from({ length: 368 }, (_, i) => {
    const count = i % 5 === 0 ? 0 : (i * 7) % 13;
    const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    return { date, count, level: Math.min(4, Math.ceil(count / 3)) as Level };
  });
  return {
    login: 'octo',
    asOf: days.at(-1)?.date ?? '',
    user: { name: null, bio: null, createdAt: '2020-02-29T00:00:00Z', followers: 1, following: 2, publicRepos: 4 },
    repos: [
      {
        name: 'alpha',
        url: 'https://github.com/octo/alpha',
        description: 'A <tool> & "friends"',
        homepage: null,
        fork: false,
        archived: false,
        stars: 1234,
        forks: 56,
        license: 'MIT',
        topics: ['cli', 'rust'],
        language: 'Rust',
        languages: [{ name: 'Rust', color: '#dea584', size: 9000 }],
        pushedAt: '2026-10-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
      },
    ],
    calendar: { total: days.reduce((n, d) => n + d.count, 0), days },
    activity: {
      commits: 300,
      issues: 5,
      pullRequests: 20,
      reviews: 0,
      restricted: 2,
      repos: [{ name: 'octo/alpha', url: 'https://github.com/octo/alpha', commits: 280 }],
      privateCommits: 120,
    },
    privateLanguages: [
      { name: 'Go', color: '#00ADD8', size: 5000 },
      // 辅助语言，归入 Other；Other 里只有它，不到 0.05%，图例里显示成 <0.1%
      { name: 'Nu', color: null, size: 1 },
    ],
  };
}

const TAG = /<(\/?)([a-zA-Z][\w:-]*)[^>]*>/g;

/** 粗略检查标签是否配对、文字里有没有没转义的 <，避免生成坏掉的 SVG */
function assertWellFormed(name: string, xml: string): void {
  const stack: string[] = [];
  for (const [tag, close, tagName = ''] of xml.matchAll(TAG)) {
    if (tag.endsWith('/>')) continue;
    if (close) assert.equal(stack.pop(), tagName, `${name}：</${tagName}> 没有对应的开始标签`);
    else stack.push(tagName);
  }
  assert.deepEqual(stack, [], `${name}：有标签没有闭合`);
  assert.ok(!xml.replace(TAG, '').includes('<'), `${name}：文字里有没转义的 <`);
}

test('切片高度都是网格的倍数、标签配对，README 引用的图片都存在', async () => {
  const page = await renderPage(buildContext(config, snapshot()));
  assert.ok(page.files.has('activity.svg') && page.files.has('phone/activity.svg'));
  for (const [name, svg] of page.files) {
    const h = Number(svg.match(/height="([\d.]+)"/)?.[1]);
    assert.equal(h % UNIT, 0, `${name} 的高度是 ${h}`);
    assertWellFormed(name, svg);
  }
  const readme = page.readme();
  for (const [, file = ''] of readme.matchAll(/src="\.\/assets\/([^"]+)"/g)) assert.ok(page.files.has(file), file);
  for (const [, file = ''] of readme.matchAll(/srcset="[^"]*\/assets\/(phone\/[^"]+)"/g)) {
    assert.ok(page.files.has(file), file);
  }
  // 链接按钮排在同一行，图片之间没有空白
  assert.match(readme, /<\/a><a href="https:\/\/example\.social\/@octo">/);
});

test('私有仓库只显示汇总数字，langs 放不下时只显示前三个', async () => {
  const page = await renderPage(buildContext(config, snapshot()));
  const svg = (name: string) => page.files.get(name) ?? '';
  assert.match(svg('activity.svg'), />\+ 120 commits in private repos</);
  assert.match(svg('languages.svg'), /bytes of code in public and private repos/);
  assert.match(svg('languages.svg'), />Go</);
  assert.match(svg('languages.svg'), />&lt;0\.1%</);
  // 桌面版的信息栏放不下五种语言，手机版放得下
  assert.match(svg('header.svg'), />Rust, Go, TypeScript</);
  assert.match(svg('phone/header.svg'), />Rust, Go, TypeScript, Python, Ruby</);
});

test('头部是状态栏、结尾是 EOF；手机版状态栏放不下时只留 ONLINE', async () => {
  const page = await renderPage(buildContext(config, snapshot()));
  const svg = (name: string) => page.files.get(name) ?? '';
  assert.match(svg('header.svg'), />SYS:\/\/GITHUB \/\/ NODE:OCTO</);
  assert.match(svg('header.svg'), />ONLINE · ALL SYSTEMS NOMINAL</);
  assert.match(svg('phone/header.svg'), />ONLINE</);
  assert.doesNotMatch(svg('phone/header.svg'), /ALL SYSTEMS NOMINAL/);
  assert.match(svg('footer.svg'), /connection to <tspan class="ac">octo<\/tspan> closed\. <tspan class="faint">\/\/ EOF/);
});

test('languages.show 把语言从 Other 清单里拿出来，不区分大小写', () => {
  const { other } = resolveConfig({ login: 'octo', tagline: '', languages: { show: ['css', 'SCSS'] } }).languages;
  assert.ok(!other.includes('CSS') && !other.includes('SCSS'));
  assert.ok(other.includes('HTML') && other.includes('Shell'));
});

test('同样的数据生成一模一样的文件', async () => {
  const a = await renderPage(buildContext(config, snapshot()));
  const b = await renderPage(buildContext(config, snapshot()));
  assert.deepEqual([...a.files], [...b.files]);
  assert.equal(a.readme(), b.readme());
});

test('没有日历和活动数据时跳过对应板块', async () => {
  const page = await renderPage(buildContext(config, { ...snapshot(), calendar: null, activity: null }));
  assert.ok(!page.files.has('contributions.svg'));
  assert.ok(!page.files.has('activity.svg'));
  assert.ok(page.files.has('header.svg') && page.files.has('footer.svg'));
});
