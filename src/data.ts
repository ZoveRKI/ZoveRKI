// 抓取结果的数据结构，保存在 data/snapshot.json。这个文件要提交进仓库：
// 某个数据源抓取失败时沿用上一次的值，主页上不会出现空白。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const SNAPSHOT_PATH = 'data/snapshot.json';

/** 贡献等级，对应 GitHub 贡献日历的五种颜色 */
export type Level = 0 | 1 | 2 | 3 | 4;

export type Day = { date: string; count: number; level: Level };

export type Calendar = { total: number; days: Day[] };

export type Language = { name: string; color: string | null; size: number };

export type Repo = {
  name: string;
  url: string;
  description: string | null;
  homepage: string | null;
  fork: boolean;
  archived: boolean;
  stars: number;
  forks: number;
  license: string | null;
  topics: string[];
  /** 主要语言 */
  language: string | null;
  /** 各语言的代码量（字节），从多到少 */
  languages: Language[];
  pushedAt: string;
  createdAt: string;
};

export type User = {
  name: string | null;
  bio: string | null;
  createdAt: string;
  followers: number;
  following: number;
  publicRepos: number;
};

/** 过去一年的活动细分，只有 GraphQL 能拿到 */
export type Activity = {
  commits: number;
  issues: number;
  pullRequests: number;
  reviews: number;
  /** 私有仓库里的贡献数，GitHub 只给总数 */
  restricted: number;
  /** 提交最多的公开仓库 */
  repos: { name: string; url: string; commits: number }[];
};

export type Snapshot = {
  login: string;
  /** 数据截止日期（贡献日历的最后一天） */
  asOf: string;
  user: User | null;
  repos: Repo[];
  calendar: Calendar | null;
  activity: Activity | null;
};

export async function readSnapshot(path = SNAPSHOT_PATH): Promise<Snapshot | null> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  return JSON.parse(text) as Snapshot;
}

export async function writeSnapshot(s: Snapshot, path = SNAPSHOT_PATH): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(s, null, 2)}\n`);
}
