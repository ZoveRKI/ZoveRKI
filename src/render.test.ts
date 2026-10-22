import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveConfig } from './config.ts';
import { buildContext } from './context.ts';
import { type Level, PHASES, type Sky, type Snapshot, WEATHERS } from './data.ts';
import { renderPage } from './render.ts';
import { contributions } from './sections/contributions.ts';
import { DESKTOP, PHONE, theme, UNIT } from './theme.ts';

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
  techStack: {
    languages: ['Rust', 'go', 'Kotlin', 'TypeScript', 'JavaScript'],
    frontend: ['React & <Vite>'],
    tools: [],
  },
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
    sky: { phase: 'night', event: 'sunrise', at: '05:51 JST', weather: 'rain' },
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

test('技术栈：语言带上统计里的颜色，空的组不显示，手机版放不下时换行', async () => {
  const page = await renderPage(buildContext(config, snapshot()));
  const desktop = page.files.get('stack.svg') ?? '';
  const phone = page.files.get('phone/stack.svg') ?? '';
  // 公开仓库里的 Rust、私有仓库里的 Go 都带上语言颜色，不区分大小写；没有数据的 Kotlin 用灰色，和同组对齐
  assert.match(desktop, /fill="#dea584"\/><text[^>]*>Rust</);
  assert.match(desktop, /fill="#00ADD8"\/><text[^>]*>go</);
  assert.match(desktop, new RegExp(`fill="${theme.faint}"/><text[^>]*>Kotlin<`));
  // 一组里都不是语言时不画小方块
  assert.match(desktop, new RegExp(`stroke="${theme.border}"/><text[^>]*>React &amp; &lt;Vite&gt;<`));
  assert.doesNotMatch(desktop, />tools</);
  assert.match(desktop, /># 2 directories, 6 files</);
  // 条目文字的基线：同一行的相同，换了行的不同
  const baseline = (svg: string, name: string): string => {
    const y = svg.match(new RegExp(`y="([\\d.]+)" font-size="\\d+">${name}</text>`))?.[1];
    assert.ok(y, `${name} 没有画出来`);
    return y;
  };
  assert.equal(baseline(desktop, 'JavaScript'), baseline(desktop, 'Rust'));
  assert.notEqual(baseline(phone, 'JavaScript'), baseline(phone, 'Rust'));
});

test('没有配置技术栈时不显示这个板块', async () => {
  const page = await renderPage(buildContext(resolveConfig({ login: 'octo', tagline: '' }), snapshot()));
  assert.ok(!page.files.has('stack.svg'));
  assert.ok(page.files.has('languages.svg'));
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

test('贡献城市从左上（最旧）往右下（最新）排，命令是 --last 1year，底下写着天色和天气', async () => {
  const page = await renderPage(buildContext(config, snapshot()));
  const svg = page.files.get('contributions.svg') ?? '';
  assert.match(svg, /<\/tspan> skyline --last 1year</);
  assert.match(svg, />night<\/tspan> · rain · sunrise 05:51 JST</);
  // 每栋楼按周依次升起：动画延迟最小的是最旧的一周，最大的是最新的一周；比较两栋楼左面的左下角
  const corners = [...svg.matchAll(/<g class="rise" style="animation-delay:([\d.]+)s"><polygon points="([\d.]+),([\d.]+)/g)]
    .map(([, d, x, y]) => [Number(d), Number(x), Number(y)] as const)
    .sort((a, b) => a[0] - b[0]);
  const [, x0 = 0, y0 = 0] = corners[0] ?? [];
  const [, x1 = 0, y1 = 0] = corners.at(-1) ?? [];
  assert.ok(corners.length > 100 && x0 < x1 && y0 < y1, `最旧 (${x0}, ${y0})，最新 (${x1}, ${y1})`);
});

test('每种时段和天气都能画出来，各有各的效果；没有配置所在地时是没有天气的夜晚', async () => {
  const draw = (sky: Sky | null, g = DESKTOP) => contributions(g, buildContext(config, { ...snapshot(), sky }));
  for (const phase of PHASES) {
    for (const weather of WEATHERS) {
      for (const g of [DESKTOP, PHONE]) {
        const svg = await draw({ phase, event: 'sunset', at: '16:58 JST', weather }, g);
        const name = `${phase}-${weather}${g.phone ? '-phone' : ''}`;
        assert.equal(Number(svg.match(/height="(\d+)"/)?.[1]) % UNIT, 0, name);
        assertWellFormed(name, svg);
      }
    }
  }
  const sky = (phase: Sky['phase'], weather: Sky['weather']): Sky => ({ phase, event: 'sunrise', at: '05:51 JST', weather });
  const has = async (s: Sky | null, ...classes: string[]): Promise<void> => {
    const svg = await draw(s);
    for (const c of classes) assert.match(svg, new RegExp(`class="${c}"`), `${s?.phase} ${s?.weather}：${c}`);
  };
  await has(sky('night', 'rain'), 'rain');
  await has(sky('dusk', 'snow'), 'snow', 'sway');
  await has(sky('dawn', 'fog'), 'fog');
  await has(sky('night', 'storm'), 'rain', 'flash', 'bolt');
  // 晴天的白天有转动的光芒，晴天的夜里有月亮，都不下雨
  const day = await draw(sky('day', 'clear'));
  assert.match(day, /class="rays"/);
  assert.doesNotMatch(day, /class="rain"/);
  assert.match(await draw(sky('night', 'clear')), /url\(#moonglow\)/);
  const plain = await draw(null);
  assert.match(plain, /url\(#moonglow\)/);
  assert.doesNotMatch(plain, /sunrise|sunset/);
});

test('城市背后有山和树，前面有海、滨海路、来回的车和船；天黑或天气不好时车灯和路灯亮着', async () => {
  const draw = (phase: Sky['phase'], weather: Sky['weather']) =>
    contributions(DESKTOP, buildContext(config, { ...snapshot(), sky: { phase, event: 'sunrise', at: '05:51 JST', weather } }));
  const night = await draw('night', 'clear');
  for (const c of ['ca', 'cb', 'boat', 'bob', 'w0']) assert.match(night, new RegExp(`class="${c}"`), c);
  assert.match(night, /fill="url\(#seaglow\)"/);
  assert.match(night, /fill="url\(#lampglow\)"/);
  assert.match(night, /fill="url\(#beam\)"/);
  // 晴天的白天不开灯，下雨的白天开灯
  assert.doesNotMatch(await draw('day', 'clear'), /url\(#lampglow\)|url\(#beam\)/);
  assert.match(await draw('day', 'rain'), /fill="url\(#lampglow\)"/);
});

test('没有日历和活动数据时跳过对应板块', async () => {
  const page = await renderPage(buildContext(config, { ...snapshot(), calendar: null, activity: null }));
  assert.ok(!page.files.has('contributions.svg'));
  assert.ok(!page.files.has('activity.svg'));
  assert.ok(page.files.has('header.svg') && page.files.has('footer.svg'));
});

test('临海景物从远到近遮挡，汽车不能盖过路灯、站棚，接触网杆在电车前面', async () => {
  for (const g of [DESKTOP, PHONE]) {
    const svg = await contributions(g, buildContext(config, snapshot()));
    const layers = ['cars', 'street-lamps', 'tram-platforms', 'tram', 'tram-overhead', 'harbor', 'boats'];
    let last = svg.lastIndexOf('class="rise"');
    for (const layer of layers) {
      const index = svg.indexOf(`data-layer="${layer}"`);
      assert.ok(index > last, `${g.phone ? '手机' : '桌面'} ${layer} 的遮挡顺序不正确`);
      last = index;
    }
  }
});

test('飞机的整个航程位于统计下方、高架上方的天空通道，桌面和手机入场都不钻桥', async () => {
  for (const g of [DESKTOP, PHONE]) {
    const svg = await contributions(g, buildContext(config, snapshot()));
    const k = g.phone ? 0.6 : 1;
    const y = Number(svg.match(/class="plane"><g transform="translate\(-30 ([\d.]+)\)"/)?.[1]);
    const rise = -Number(svg.match(/@keyframes zfly\{.*?to\{transform:translate\([^,]+,([-\d.]+)px\)/)?.[1]);
    const landY = Number(svg.match(/<mask id="land"[^>]* y="([\d.]+)"/)?.[1]);
    const statY = Math.max(...[...svg.matchAll(/<text\b[^>]* y="([\d.]+)"[^>]*>(?:active days|current streak|longest streak|best ·[^<]+)<\/text>/g)].map(([, v]) => Number(v)));
    assert.ok(y - rise - 1.6 * k > statY + 2 * k, '飞机进入了统计文字区域');
    assert.ok(y + 2.6 * k < landY - 4 * k, '飞机入场位置与高架重叠');
  }
});
