import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Repo, stableRepos } from './data.ts';

const repo = (name: string, pushedAt: string, createdAt = '2025-01-01T00:00:00Z'): Repo => ({
  name,
  url: `https://github.com/octo/${name}`,
  description: null,
  homepage: null,
  fork: false,
  archived: false,
  stars: 0,
  forks: 0,
  license: null,
  topics: [],
  language: null,
  languages: [],
  pushedAt,
  createdAt,
});

test('工作流往主页仓库推送不会让快照里的仓库列表变化', () => {
  // 两次运行之间，工作流的提交只改了主页仓库的推送时间，接口按推送时间排序时它也挪到了最前面
  const [alpha, beta] = [repo('alpha', '2026-10-22T09:00:00Z'), repo('beta', '2026-09-29T16:40:08Z')];
  const before = [alpha, repo('octo', '2026-10-22T04:49:13Z', '2026-10-21T16:45:25Z'), beta];
  const after = [repo('octo', '2026-10-22T14:27:20Z', '2026-10-21T16:45:25Z'), alpha, beta];
  assert.deepEqual(stableRepos(after, 'Octo'), stableRepos(before, 'octo'));
  // 主页仓库记成创建时间，和别的仓库一起按推送时间从新到旧排
  assert.deepEqual(
    stableRepos(after, 'octo').map((r) => [r.name, r.pushedAt]),
    [
      ['alpha', '2026-10-22T09:00:00Z'],
      ['octo', '2026-10-21T16:45:25Z'],
      ['beta', '2026-09-29T16:40:08Z'],
    ],
  );
  // 别的仓库有了新的推送时照常更新
  assert.equal(stableRepos([...after.slice(0, 2), repo('beta', '2026-10-23T01:00:00Z')], 'octo')[0]?.name, 'beta');
});
