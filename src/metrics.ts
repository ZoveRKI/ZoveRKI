// 从原始数据算出各板块要显示的数值
import type { FeaturedProject } from './config.ts';
import type { Activity, Day, Language, Repo } from './data.ts';
import { readable, weekday } from './svg.ts';
import { theme as t } from './theme.ts';

export type Streaks = { current: number; longest: number };

/** 连续贡献天数。今天还没有贡献时不算中断，从昨天开始往前数 */
export function streaks(days: Day[]): Streaks {
  let longest = 0;
  let run = 0;
  for (const d of days) {
    run = d.count > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let i = days.length - 1;
  if (days[i]?.count === 0) i--;
  let current = 0;
  while (i >= 0 && (days[i]?.count ?? 0) > 0) {
    current++;
    i--;
  }
  return { current, longest };
}

/** 贡献最多的一天，并列时取最近的 */
export function bestDay(days: Day[]): Day | null {
  let best: Day | null = null;
  for (const d of days) if (d.count > 0 && (!best || d.count >= best.count)) best = d;
  return best;
}

/** 按星期几汇总贡献，下标 0 是周日 */
export function weekdayTotals(days: Day[]): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const d of days) out[weekday(d.date)] += d.count;
  return out;
}

export type Share = { name: string; color: string; size: number; pct: number; other: boolean };

type ShareOpts = {
  /** 私有仓库按语言加总的代码量 */
  extra: Language[];
  exclude: string[];
  max: number;
  /** 主页仓库（生成器的代码）不算在内 */
  profileRepo: string;
};

/**
 * 各语言的代码量占比。算自己名下的非 fork 仓库，公开和私有的合在一起（私有仓库只有按语言加总的数字），
 * 不算主页仓库本身；超过 max 种时，排在后面的合并成 Other。
 */
export function languageShares(repos: Repo[], o: ShareOpts): Share[] {
  const skip = new Set(o.exclude.map((s) => s.toLowerCase()));
  const sizes = new Map<string, { size: number; color: string | null }>();
  const add = (l: Language) => {
    if (skip.has(l.name.toLowerCase())) return;
    const cur = sizes.get(l.name) ?? { size: 0, color: l.color };
    cur.size += l.size;
    cur.color ??= l.color;
    sizes.set(l.name, cur);
  };
  for (const r of repos) {
    if (r.fork || r.name.toLowerCase() === o.profileRepo.toLowerCase()) continue;
    r.languages.forEach(add);
  }
  o.extra.forEach(add);
  const total = [...sizes.values()].reduce((n, v) => n + v.size, 0);
  if (!total) return [];
  const sorted = [...sizes]
    .map(([name, v]) => ({ name, size: v.size, color: readable(v.color ?? t.dim) }))
    .sort((a, b) => b.size - a.size || (a.name < b.name ? -1 : 1));
  const head = sorted.length > o.max ? sorted.slice(0, o.max - 1) : sorted;
  const out: Share[] = head.map((l) => ({ ...l, pct: (l.size / total) * 100, other: false }));
  const rest = sorted.slice(head.length).reduce((n, l) => n + l.size, 0);
  if (rest) out.push({ name: 'Other', color: t.faint, size: rest, pct: (rest / total) * 100, other: true });
  return out;
}

export type OverviewItem = {
  key: 'commits' | 'reviews' | 'issues' | 'prs';
  label: string;
  count: number;
  pct: number;
};

/** 活动概览的四项各占的百分比，和 GitHub 一样四舍五入到整数 */
export function overview(a: Activity): OverviewItem[] | null {
  const items: Omit<OverviewItem, 'pct'>[] = [
    { key: 'commits', label: 'Commits', count: a.commits },
    { key: 'reviews', label: 'Code review', count: a.reviews },
    { key: 'issues', label: 'Issues', count: a.issues },
    { key: 'prs', label: 'Pull requests', count: a.pullRequests },
  ];
  const total = items.reduce((n, i) => n + i.count, 0);
  if (!total) return null;
  return items.map((i) => ({ ...i, pct: Math.round((i.count / total) * 100) }));
}

/** 账号注册了多久，比如 2y 5m */
export function accountAge(createdAt: string, asOf: string): string {
  const [y1 = 0, m1 = 0, d1 = 0] = createdAt.slice(0, 10).split('-').map(Number);
  const [y2 = 0, m2 = 0, d2 = 0] = asOf.split('-').map(Number);
  const months = Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y}y` : '', m || !y ? `${m}m` : ''].filter(Boolean).join(' ');
}

export type Project = {
  name: string;
  url: string;
  description: string;
  language: string | null;
  color: string;
  stars: number;
  forks: number;
  /** 最后一次推送的日期 */
  updated: string | null;
  topics: string[];
};

/** 精选项目：按配置的顺序；没有配置时选 star 多、最近有更新的非 fork 仓库 */
export function pickProjects(repos: Repo[], featured: FeaturedProject[], login: string, max = 6): Project[] {
  const toProject = (r: Repo | undefined, f: FeaturedProject): Project => {
    const lang = r?.languages.find((l) => l.name === r.language) ?? r?.languages[0];
    return {
      name: r?.name ?? f.repo,
      url: r?.url ?? `https://github.com/${login}/${f.repo}`,
      description: f.description ?? r?.description ?? 'No description yet.',
      language: r?.language ?? lang?.name ?? null,
      color: readable(lang?.color ?? t.dim),
      stars: r?.stars ?? 0,
      forks: r?.forks ?? 0,
      updated: r?.pushedAt.slice(0, 10) ?? null,
      topics: r?.topics ?? [],
    };
  };
  if (featured.length) {
    return featured.map((f) => toProject(repos.find((r) => r.name.toLowerCase() === f.repo.toLowerCase()), f));
  }
  return repos
    .filter((r) => !r.fork && !r.archived && r.name.toLowerCase() !== login.toLowerCase())
    .sort((a, b) => b.stars - a.stars || (a.pushedAt < b.pushedAt ? 1 : -1))
    .slice(0, max)
    .map((r) => toProject(r, { repo: r.name }));
}
