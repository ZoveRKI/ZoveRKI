// 配置的类型和默认值。要改的内容写在根目录的 profile.config.ts。
import userConfig from '../profile.config.ts';

export type Link = {
  label: string;
  url: string;
  /** 按钮上的第二行小字，比如网址 */
  note?: string;
};

export type FeaturedProject = {
  /** 仓库名（不带用户名） */
  repo: string;
  /** 主页上显示的介绍，不填就用仓库在 GitHub 上的 description */
  description?: string;
};

export const SECTIONS = ['contributions', 'activity', 'languages', 'projects'] as const;
export type Section = (typeof SECTIONS)[number];

export type ProfileConfig = {
  /** GitHub 用户名，也是主页仓库的名字 */
  login: string;
  /** 头部的大标题，默认用 login */
  name?: string;
  /** 大标题下面的一句话简介 */
  tagline: string;
  /** 终端标题栏和信息栏里的 user@host，默认是「小写用户名@github」 */
  host?: string;
  /** 头部信息栏里额外显示的条目，比如 ['editor', 'VS Code'] */
  facts?: [string, string][];
  /** 头部下面的一排链接按钮，不填就不显示 */
  links?: Link[];
  /** 精选项目，按顺序显示；不填时自动选 star 多、最近有更新的非 fork 仓库 */
  projects?: FeaturedProject[];
  languages?: {
    /** 不计入统计的语言，比如 ['HTML', 'CSS'] */
    exclude?: string[];
    /** 最多显示几种，其余合并成 Other */
    max?: number;
  };
  /** 板块和顺序，不想显示的板块从这里删掉 */
  sections?: Section[];
  /** 主页仓库的默认分支，手机版图片的地址要用 */
  branch?: string;
};

export type Config = {
  login: string;
  name: string;
  tagline: string;
  host: string;
  facts: [string, string][];
  links: Link[];
  projects: FeaturedProject[];
  languages: { exclude: string[]; max: number };
  sections: Section[];
  branch: string;
};

export function resolveConfig(c: ProfileConfig): Config {
  return {
    login: c.login,
    name: c.name ?? c.login,
    tagline: c.tagline,
    host: c.host ?? `${c.login.toLowerCase()}@github`,
    facts: c.facts ?? [],
    links: c.links ?? [],
    projects: c.projects ?? [],
    languages: { exclude: c.languages?.exclude ?? [], max: c.languages?.max ?? 6 },
    sections: c.sections ?? [...SECTIONS],
    branch: c.branch ?? 'main',
  };
}

export const config: Config = resolveConfig(userConfig);
