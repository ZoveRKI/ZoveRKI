import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Day, Repo } from './data.ts';
import { accountAge, bestDay, languageShares, overview, streaks, weekdayTotals } from './metrics.ts';

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

test('语言占比不算 fork 和主页仓库，超出数量的合并成 Other', () => {
  const repos = [
    repo('app', [
      ['Rust', 600],
      ['TypeScript', 300],
      ['CSS', 50],
      ['HTML', 30],
    ]),
    repo('forked', [['Go', 10_000]], true),
    repo('octo', [['TypeScript', 10_000]]),
    repo('tool', [['Python', 20]]),
  ];
  const shares = languageShares(repos, ['html'], 3, 'Octo');
  assert.deepEqual(
    shares.map((s) => [s.name, Math.round(s.pct * 10) / 10, s.other]),
    [
      ['Rust', 61.9, false],
      ['TypeScript', 30.9, false],
      ['Other', 7.2, true],
    ],
  );
});

test('活动概览按四项的总和算百分比', () => {
  const items = overview({ commits: 77, issues: 10, pullRequests: 11, reviews: 2, restricted: 0, repos: [] });
  assert.deepEqual(
    items?.map((i) => [i.key, i.pct]),
    [
      ['commits', 77],
      ['reviews', 2],
      ['issues', 10],
      ['prs', 11],
    ],
  );
  assert.equal(overview({ commits: 0, issues: 0, pullRequests: 0, reviews: 0, restricted: 3, repos: [] }), null);
});

test('账号注册时长', () => {
  assert.equal(accountAge('2024-04-30T15:39:50Z', '2026-10-21'), '2y 5m');
  assert.equal(accountAge('2026-01-15T00:00:00Z', '2026-03-10'), '1m');
  assert.equal(accountAge('2025-10-21T00:00:00Z', '2026-10-21'), '1y');
});
