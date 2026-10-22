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
  /** 令牌看不到的私有贡献数，GitHub 只给总数 */
  restricted: number;
  /** 提交最多的公开仓库 */
  repos: { name: string; url: string; commits: number }[];
  /** 私有仓库里的提交总数，不含仓库名；需要能读私有仓库的令牌 */
  privateCommits: number;
};

/** 一天里的时段，按所在地的日出日落划分 */
export const PHASES = ['night', 'dawn', 'day', 'dusk'] as const;
export type Phase = (typeof PHASES)[number];

/** 天气，由 Open-Meteo 的天气代码归成几类 */
export const WEATHERS = ['clear', 'cloudy', 'overcast', 'fog', 'drizzle', 'rain', 'snow', 'storm'] as const;
export type Weather = (typeof WEATHERS)[number];

/** 抓取数据时所在地的天色和天气，贡献城市的天空照着它画 */
export type Sky = {
  phase: Phase;
  /** 夜里和黎明显示日出时间，白天和黄昏显示日落时间 */
  event: 'sunrise' | 'sunset';
  /** 当地时间，比如 05:51 JST */
  at: string;
  /** 抓不到天气时是 null */
  weather: Weather | null;
};

export type Snapshot = {
  login: string;
  /** 数据截止日期（贡献日历的最后一天） */
  asOf: string;
  user: User | null;
  repos: Repo[];
  calendar: Calendar | null;
  activity: Activity | null;
  /** 私有仓库按语言加总的代码量，不含仓库名；需要能读私有仓库的令牌 */
  privateLanguages: Language[];
  /** 没有配置所在地（location）时是 null */
  sky: Sky | null;
};

/**
 * 写进快照前整理仓库列表。主页仓库自己的推送时间每次都会被工作流的提交改掉，照实记下来的话，
 * 下一次运行又会因为它变了而提交，一直循环下去；主页上也用不到它（项目列表排除了主页仓库），
 * 所以记成创建时间。仓库按推送时间从新到旧排、时间相同时按名字排，主页仓库的位置也就固定了。
 */
export function stableRepos(repos: Repo[], profileRepo: string): Repo[] {
  return repos
    .map((r) => (r.name.toLowerCase() === profileRepo.toLowerCase() ? { ...r, pushedAt: r.createdAt } : r))
    .sort((a, b) => (a.pushedAt === b.pushedAt ? (a.name < b.name ? -1 : 1) : a.pushedAt < b.pushedAt ? 1 : -1));
}

export async function readSnapshot(path = SNAPSHOT_PATH): Promise<Snapshot | null> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  const s = JSON.parse(text) as Snapshot;
  // 旧版本的数据没有这些字段
  s.privateLanguages ??= [];
  s.sky ??= null;
  if (s.activity) s.activity.privateCommits ??= 0;
  return s;
}

export async function writeSnapshot(s: Snapshot, path = SNAPSHOT_PATH): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(s, null, 2)}\n`);
}
