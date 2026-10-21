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

/**
 * 语言占比里一律归入 Other 的辅助语言：标记、样式、模板、构建和脚本。
 * 名字和 GitHub 语言统计里的一致，不区分大小写。
 */
export const OTHER_LANGUAGES = [
  // 标记和模板
  'HTML',
  'HTML+ERB',
  'ERB',
  'EJS',
  'Handlebars',
  'Haml',
  'Slim',
  'Liquid',
  'Twig',
  'Jinja',
  'Pug',
  // 样式
  'CSS',
  'SCSS',
  'Sass',
  'Less',
  'Stylus',
  'PostCSS',
  // 构建和脚本
  'Shell',
  'PowerShell',
  'Batchfile',
  'Nushell',
  'Nu',
  'Makefile',
  'Dockerfile',
  'CMake',
  'Nix',
  'Procfile',
  'Just',
];
export type Section = (typeof SECTIONS)[number];

export type ProfileConfig = {
  /** GitHub 用户名，也是主页仓库的名字 */
  login: string;
  /** 头部的大标题，默认用 login */
  name?: string;
  /** 大标题下面的一句话简介 */
  tagline: string;
  /** 信息栏顶部的 user@host，默认是「小写用户名@github」 */
  host?: string;
  /** 头部最上面状态栏左右两段文字，默认是 SYS://GITHUB // NODE:用户名 和 ONLINE · ALL SYSTEMS NOMINAL */
  status?: [left: string, right: string];
  /** 信息栏 langs 一行显示的语言：放得下就全部显示，放不下只显示前三个；不填就按代码量取前三 */
  stack?: string[];
  /** 头部信息栏里额外显示的条目，比如 ['editor', 'VS Code'] */
  facts?: [string, string][];
  /** 头部下面的一排链接按钮，不填就不显示 */
  links?: Link[];
  /** 精选项目，按顺序显示；不填时自动选 star 多、最近有更新的非 fork 仓库 */
  projects?: FeaturedProject[];
  languages?: {
    /** 完全不计入统计的语言 */
    exclude?: string[];
    /** 计入统计、但一律归入 Other 的语言，默认是 OTHER_LANGUAGES（标记、样式、构建脚本类） */
    other?: string[];
    /** 从上面的 Other 清单里拿出来、按正常规则单独显示的语言，比如 ['CSS'] */
    show?: string[];
    /** 占比低于多少（%）的语言归入 Other，默认 1 */
    min?: number;
    /** 最多单独显示几种语言，默认 8 */
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
  status: [left: string, right: string];
  stack: string[];
  facts: [string, string][];
  links: Link[];
  projects: FeaturedProject[];
  languages: { exclude: string[]; other: string[]; min: number; max: number };
  sections: Section[];
  branch: string;
};

export function resolveConfig(c: ProfileConfig): Config {
  const show = new Set((c.languages?.show ?? []).map((s) => s.toLowerCase()));
  return {
    login: c.login,
    name: c.name ?? c.login,
    tagline: c.tagline,
    host: c.host ?? `${c.login.toLowerCase()}@github`,
    status: c.status ?? [`SYS://GITHUB // NODE:${c.login.toUpperCase()}`, 'ONLINE · ALL SYSTEMS NOMINAL'],
    stack: c.stack ?? [],
    facts: c.facts ?? [],
    links: c.links ?? [],
    projects: c.projects ?? [],
    languages: {
      exclude: c.languages?.exclude ?? [],
      other: (c.languages?.other ?? OTHER_LANGUAGES).filter((l) => !show.has(l.toLowerCase())),
      min: c.languages?.min ?? 1,
      max: c.languages?.max ?? 8,
    },
    sections: c.sections ?? [...SECTIONS],
    branch: c.branch ?? 'main',
  };
}

export const config: Config = resolveConfig(userConfig);
