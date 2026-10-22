import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Day, Repo } from './data.ts';
import { accountAge, bestDay, languageShares, overview, stackGroups, streaks, weekdayTotals } from './metrics.ts';
import { readable } from './svg.ts';

/** 从 2026-01-01（周四）开始的连续日子 */
const days = (counts: number[]): Day[] =>
  counts.map((count, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, count, level: count ? 1 : 0 }));

const repo = (name: string, languages: [string, number][], fork = false): Repo => ({
  name,
  url: `https://github.com/octo/${name}`,
  description: null,
  homepage: null,
  fork,
  archived: false,
  stars: 0,
  forks: 0,
  license: null,
  topics: [],
  language: languages[0]?.[0] ?? null,
  languages: languages.map(([n, size]) => ({ name: n, color: null, size })),
  pushedAt: '2026-01-01T00:00:00Z',
  createdAt: '2025-01-01T00:00:00Z',
});

test('今天还没有贡献时，当前连续天数从昨天往前数', () => {
  assert.deepEqual(streaks(days([1, 0, 2, 3, 0])), { current: 2, longest: 2 });
  assert.deepEqual(streaks(days([1, 1, 1, 0, 4])), { current: 1, longest: 3 });
  assert.deepEqual(streaks(days([0, 0])), { current: 0, longest: 0 });
  assert.deepEqual(streaks([]), { current: 0, longest: 0 });
});

test('最忙的一天并列时取最近的', () => {
  assert.equal(bestDay(days([3, 5, 1, 5]))?.date, '2026-01-04');
  assert.equal(bestDay(days([0, 0])), null);
});

test('按星期几汇总贡献', () => {
  assert.deepEqual(weekdayTotals(days([1, 2, 3, 4, 5, 6, 7, 8])), [4, 5, 6, 7, 9, 2, 3]);
});

test('语言占比：辅助语言和占比太小的归入 Other，不算 fork 和主页仓库', () => {
  const repos = [
    repo('app', [
      ['TypeScript', 500],
      ['CSS', 300],
      ['Rust', 150],
      ['Python', 8],
    ]),
    repo('forked', [['Go', 10_000]], true),
    repo('octo', [['TypeScript', 10_000]]),
  ];
  // 私有仓库按语言加总的数字合并进同一份统计
  const extra = [{ name: 'Shell', color: null, size: 42 }];
  const opts = { extra, exclude: [], other: ['CSS', 'Shell'], min: 1, max: 8, profileRepo: 'Octo' };
  const round = (s: { name: string; pct: number; other: boolean }) => [s.name, Math.round(s.pct * 10) / 10, s.other];
  // 总数 1000：CSS、Shell 是辅助语言，Python 不到 1%，都归入 Other
  assert.deepEqual(languageShares(repos, opts).map(round), [
    ['TypeScript', 50, false],
    ['Rust', 15, false],
    ['Other', 35, true],
  ]);
  // max 限制单独显示的数量
  assert.deepEqual(languageShares(repos, { ...opts, max: 1 }).map(round), [
    ['TypeScript', 50, false],
    ['Other', 50, true],
  ]);
  // exclude 的语言连总数都不算：总数变成 700，Python 超过 1% 就单独显示了
  assert.deepEqual(languageShares(repos, { ...opts, exclude: ['css'] }).map(round), [
    ['TypeScript', 71.4, false],
    ['Rust', 21.4, false],
    ['Python', 1.1, false],
    ['Other', 6, true],
  ]);
  // 全都是辅助语言时按占比显示
  const site = [
    repo('site', [
      ['HTML', 60],
      ['CSS', 40],
    ]),
  ];
  assert.deepEqual(languageShares(site, { ...opts, extra: [], other: ['HTML', 'CSS'] }).map(round), [
    ['HTML', 60, false],
    ['CSS', 40, false],
  ]);
});

test('技术栈的条目和语言同名时带上语言颜色，不区分大小写，太暗的颜色调亮', () => {
  const app: Repo = { ...repo('app', []), languages: [{ name: 'Rust', color: '#dea584', size: 10 }] };
  const extra = [
    { name: 'Ruby', color: '#701516', size: 1 },
    { name: 'Nu', color: null, size: 1 },
  ];
  const groups = stackGroups(
    [
      ['languages', ['rust', 'Ruby', 'Nu']],
      ['backend', ['axum']],
    ],
    [app],
    extra,
  );
  assert.deepEqual(groups, [
    {
      name: 'languages',
      items: [
        { name: 'rust', color: '#dea584' },
        { name: 'Ruby', color: readable('#701516') },
        { name: 'Nu', color: null },
      ],
    },
    { name: 'backend', items: [{ name: 'axum', color: null }] },
  ]);
});

test('活动概览按四项的总和算百分比', () => {
  const base = { restricted: 0, repos: [], privateCommits: 0 };
  const items = overview({ ...base, commits: 77, issues: 10, pullRequests: 11, reviews: 2 });
  assert.deepEqual(
    items?.map((i) => [i.key, i.pct]),
    [
      ['commits', 77],
      ['reviews', 2],
      ['issues', 10],
      ['prs', 11],
    ],
  );
  assert.equal(overview({ ...base, commits: 0, issues: 0, pullRequests: 0, reviews: 0, restricted: 3 }), null);
});

test('账号注册时长', () => {
  assert.equal(accountAge('2024-04-30T15:39:50Z', '2026-10-21'), '2y 5m');
  assert.equal(accountAge('2026-01-15T00:00:00Z', '2026-03-10'), '1m');
  assert.equal(accountAge('2025-10-21T00:00:00Z', '2026-10-21'), '1y');
});
