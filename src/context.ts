// 渲染上下文：把配置和抓到的数据整理成各板块直接能用的数值
import type { Config } from './config.ts';
import type { Day, Snapshot } from './data.ts';
import {
  bestDay,
  languageShares,
  overview,
  type OverviewItem,
  pickProjects,
  type Project,
  type Share,
  type StackGroup,
  stackGroups,
  streaks,
  type Streaks,
  weekdayTotals,
} from './metrics.ts';

export type TopRepo = { name: string; url: string; commits: number };

export type Ctx = {
  config: Config;
  s: Snapshot;
  /** 贡献日历，没有数据时是空数组 */
  days: Day[];
  total: number;
  /** 有贡献的天数 */
  active: number;
  streak: Streaks;
  best: Day | null;
  /** 按星期几汇总的贡献，下标 0 是周日 */
  weekdays: number[];
  langs: Share[];
  /** 活动概览，没有 GraphQL 数据时是 null */
  overview: OverviewItem[] | null;
  topRepos: TopRepo[];
  /** 私有仓库里的提交总数 */
  privateCommits: number;
  projects: Project[];
  /** 技术栈的分组，没有配置时是空数组 */
  techStack: StackGroup[];
  /** 自己名下非 fork 仓库的 star 总数 */
  stars: number;
};

export function buildContext(config: Config, s: Snapshot): Ctx {
  const days = s.calendar?.days ?? [];
  return {
    config,
    s,
    days,
    total: s.calendar?.total ?? 0,
    active: days.filter((d) => d.count > 0).length,
    streak: streaks(days),
    best: bestDay(days),
    weekdays: weekdayTotals(days),
    langs: languageShares(s.repos, { ...config.languages, extra: s.privateLanguages, profileRepo: config.login }),
    overview: s.activity ? overview(s.activity) : null,
    topRepos: s.activity?.repos ?? [],
    privateCommits: s.activity?.privateCommits ?? 0,
    projects: pickProjects(s.repos, config.projects, config.login),
    techStack: stackGroups(config.techStack, s.repos, s.privateLanguages),
    stars: s.repos.filter((r) => !r.fork).reduce((n, r) => n + r.stars, 0),
  };
}
