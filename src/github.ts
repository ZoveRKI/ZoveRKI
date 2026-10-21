// GitHub 的数据接口：GraphQL（需要 token）、REST（token 可选）和公开的贡献日历页面
import type { Activity, Calendar, Day, Language, Level, Repo, User } from './data.ts';

const API = 'https://api.github.com';
const UA = 'zoverki-profile-generator';

/** 优先用能看到更多数据的 PROFILE_TOKEN，其次是 Actions 自带的 GITHUB_TOKEN；name 是环境变量名，用于日志 */
export function githubToken(): { name: string; value: string } | null {
  for (const name of ['PROFILE_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN']) {
    const value = process.env[name];
    if (value) return { name, value };
  }
  return null;
}

type RequestOpts = { token?: string | null; body?: unknown; accept?: string };

async function request(url: string, o: RequestOpts = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'User-Agent': UA,
    Accept: o.accept ?? 'application/vnd.github+json',
    'Accept-Language': 'en-US',
  };
  if (o.token) headers.Authorization = `Bearer ${o.token}`;
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method: o.body === undefined ? 'GET' : 'POST',
    headers,
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}（${url}）`);
  return res;
}

/** REST 接口不给语言颜色，常见语言按 GitHub（linguist）的配色补上 */
const LANG_COLORS: Record<string, string> = {
  C: '#555555',
  'C#': '#178600',
  'C++': '#f34b7d',
  CSS: '#663399',
  Dart: '#00B4AB',
  Dockerfile: '#384d54',
  Go: '#00ADD8',
  HTML: '#e34c26',
  Java: '#b07219',
  JavaScript: '#f1e05a',
  'Jupyter Notebook': '#DA5B0B',
  Kotlin: '#A97BFF',
  Lua: '#000080',
  Makefile: '#427819',
  PHP: '#4F5D95',
  PowerShell: '#012456',
  Python: '#3572A5',
  Ruby: '#701516',
  Rust: '#dea584',
  SCSS: '#c6538c',
  Shell: '#89e051',
  Svelte: '#ff3e00',
  Swift: '#F05138',
  TypeScript: '#3178c6',
  Vue: '#41b883',
  Zig: '#ec915c',
};

const LEVELS: Record<string, Level> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

/** GitHub 识别不出的许可证会返回 NOASSERTION，当成没有 */
const license = (id: string | null | undefined): string | null => (id && id !== 'NOASSERTION' ? id : null);

const QUERY = `query ($login: String!) {
  user(login: $login) {
    name
    bio
    createdAt
    followers { totalCount }
    following { totalCount }
    repositories(ownerAffiliations: OWNER, privacy: PUBLIC, first: 100, orderBy: { field: PUSHED_AT, direction: DESC }) {
      totalCount
      nodes {
        name
        url
        description
        homepageUrl
        isFork
        isArchived
        stargazerCount
        forkCount
        pushedAt
        createdAt
        licenseInfo { spdxId }
        primaryLanguage { name }
        repositoryTopics(first: 10) { nodes { topic { name } } }
        languages(first: 20, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } }
      }
    }
    privateRepos: repositories(ownerAffiliations: OWNER, privacy: PRIVATE, isFork: false, first: 100) {
      nodes {
        languages(first: 20, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } }
      }
    }
    contributionsCollection {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      restrictedContributionsCount
      commitContributionsByRepository(maxRepositories: 100) {
        repository { nameWithOwner url isPrivate }
        contributions { totalCount }
      }
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}`;

type GqlLanguages = { edges: { size: number; node: { name: string; color: string | null } }[] };

type GqlRepo = {
  name: string;
  url: string;
  description: string | null;
  homepageUrl: string | null;
  isFork: boolean;
  isArchived: boolean;
  stargazerCount: number;
  forkCount: number;
  pushedAt: string | null;
  createdAt: string;
  licenseInfo: { spdxId: string | null } | null;
  primaryLanguage: { name: string } | null;
  repositoryTopics: { nodes: { topic: { name: string } }[] };
  languages: GqlLanguages;
};

type GqlUser = {
  name: string | null;
  bio: string | null;
  createdAt: string;
  followers: { totalCount: number };
  following: { totalCount: number };
  repositories: { totalCount: number; nodes: GqlRepo[] };
  privateRepos: { nodes: { languages: GqlLanguages }[] };
  contributionsCollection: {
    totalCommitContributions: number;
    totalIssueContributions: number;
    totalPullRequestContributions: number;
    totalPullRequestReviewContributions: number;
    restrictedContributionsCount: number;
    commitContributionsByRepository: {
      repository: { nameWithOwner: string; url: string; isPrivate: boolean };
      contributions: { totalCount: number };
    }[];
    contributionCalendar: {
      totalContributions: number;
      weeks: { contributionDays: { date: string; contributionCount: number; contributionLevel: string }[] }[];
    };
  };
};

export type GraphqlResult = {
  user: User;
  repos: Repo[];
  calendar: Calendar;
  activity: Activity;
  privateLanguages: Language[];
};

/** 把多个仓库的语言统计按语言加总，只留总数 */
function sumLanguages(list: GqlLanguages[]): Language[] {
  const sizes = new Map<string, Language>();
  for (const l of list) {
    for (const e of l.edges) {
      const cur = sizes.get(e.node.name) ?? { name: e.node.name, color: e.node.color, size: 0 };
      cur.size += e.size;
      sizes.set(e.node.name, cur);
    }
  }
  return [...sizes.values()].sort((a, b) => b.size - a.size || (a.name < b.name ? -1 : 1));
}

/** 用一次 GraphQL 查询拿到用户、仓库、贡献日历和活动细分 */
export async function fetchGraphql(login: string, token: string): Promise<GraphqlResult> {
  const res = await request(`${API}/graphql`, { token, body: { query: QUERY, variables: { login } } });
  const json = (await res.json()) as { data?: { user: GqlUser | null }; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
  const u = json.data?.user;
  if (!u) throw new Error(`找不到用户 ${login}`);
  const cc = u.contributionsCollection;
  const byRepo = cc.commitContributionsByRepository;
  return {
    user: {
      name: u.name,
      bio: u.bio,
      createdAt: u.createdAt,
      followers: u.followers.totalCount,
      following: u.following.totalCount,
      publicRepos: u.repositories.totalCount,
    },
    repos: u.repositories.nodes.map((r) => ({
      name: r.name,
      url: r.url,
      description: r.description,
      homepage: r.homepageUrl || null,
      fork: r.isFork,
      archived: r.isArchived,
      stars: r.stargazerCount,
      forks: r.forkCount,
      license: license(r.licenseInfo?.spdxId),
      topics: r.repositoryTopics.nodes.map((n) => n.topic.name),
      language: r.primaryLanguage?.name ?? null,
      languages: sumLanguages([r.languages]),
      pushedAt: r.pushedAt ?? r.createdAt,
      createdAt: r.createdAt,
    })),
    calendar: {
      total: cc.contributionCalendar.totalContributions,
      days: cc.contributionCalendar.weeks
        .flatMap((w) => w.contributionDays)
        .map((d) => ({ date: d.date, count: d.contributionCount, level: LEVELS[d.contributionLevel] ?? 0 })),
    },
    activity: {
      commits: cc.totalCommitContributions,
      issues: cc.totalIssueContributions,
      pullRequests: cc.totalPullRequestContributions,
      reviews: cc.totalPullRequestReviewContributions,
      restricted: cc.restrictedContributionsCount,
      // 私有仓库的名字不能出现在公开的主页上，只记提交总数
      repos: byRepo
        .filter((r) => !r.repository.isPrivate)
        .slice(0, 10)
        .map((r) => ({ name: r.repository.nameWithOwner, url: r.repository.url, commits: r.contributions.totalCount })),
      privateCommits: byRepo
        .filter((r) => r.repository.isPrivate)
        .reduce((n, r) => n + r.contributions.totalCount, 0),
    },
    privateLanguages: sumLanguages(u.privateRepos.nodes.map((r) => r.languages)),
  };
}

type RestUser = {
  name: string | null;
  bio: string | null;
  created_at: string;
  followers: number;
  following: number;
  public_repos: number;
};

type RestRepo = {
  name: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  fork: boolean;
  archived: boolean;
  stargazers_count: number;
  forks_count: number;
  license: { spdx_id: string | null } | null;
  topics?: string[];
  language: string | null;
  pushed_at: string | null;
  created_at: string;
};

export async function fetchRestUser(login: string, token: string | null): Promise<User> {
  const res = await request(`${API}/users/${encodeURIComponent(login)}`, { token });
  const u = (await res.json()) as RestUser;
  return {
    name: u.name,
    bio: u.bio,
    createdAt: u.created_at,
    followers: u.followers,
    following: u.following,
    publicRepos: u.public_repos,
  };
}

/** 自己名下的公开仓库；非 fork 的仓库再逐个取语言统计 */
export async function fetchRestRepos(login: string, token: string | null): Promise<Repo[]> {
  const owner = encodeURIComponent(login);
  const res = await request(`${API}/users/${owner}/repos?type=owner&sort=pushed&per_page=100`, { token });
  const list = (await res.json()) as RestRepo[];
  return Promise.all(
    list.map(async (r) => {
      let languages: Language[] = [];
      if (!r.fork) {
        const sizes = (await (
          await request(`${API}/repos/${owner}/${encodeURIComponent(r.name)}/languages`, { token })
        ).json()) as Record<string, number>;
        languages = Object.entries(sizes)
          .map(([name, size]) => ({ name, color: LANG_COLORS[name] ?? null, size }))
          .sort((a, b) => b.size - a.size);
      }
      return {
        name: r.name,
        url: r.html_url,
        description: r.description,
        homepage: r.homepage || null,
        fork: r.fork,
        archived: r.archived,
        stars: r.stargazers_count,
        forks: r.forks_count,
        license: license(r.license?.spdx_id),
        topics: r.topics ?? [],
        language: r.language,
        languages,
        pushedAt: r.pushed_at ?? r.created_at,
        createdAt: r.created_at,
      };
    }),
  );
}

/** 不需要 token：从公开的贡献日历页面解析出每天的贡献数 */
export async function fetchCalendarPage(login: string): Promise<Calendar> {
  const res = await request(`https://github.com/users/${encodeURIComponent(login)}/contributions`, {
    accept: 'text/html',
  });
  return parseCalendarHtml(await res.text());
}

const attr = (tag: string, name: string): string | undefined => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

/** 页面里每天是一个 <td data-date data-level>，具体数字在 for 指向它的 <tool-tip> 里 */
export function parseCalendarHtml(html: string): Calendar {
  const cells = new Map<string, Day>();
  for (const [tag] of html.matchAll(/<td\b[^>]*ContributionCalendar-day[^>]*>/g)) {
    const date = attr(tag, 'data-date');
    const id = attr(tag, 'id');
    if (!date || !id) continue;
    const level = Math.min(4, Math.max(0, Number(attr(tag, 'data-level') ?? 0))) as Level;
    cells.set(id, { date, count: 0, level });
  }
  for (const [, id, text] of html.matchAll(/<tool-tip\b[^>]*\sfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    const day = cells.get(id ?? '');
    const n = text?.match(/^\s*([\d,]+) contributions?/);
    if (day && n?.[1]) day.count = Number(n[1].replaceAll(',', ''));
  }
  const days = [...cells.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (days.length < 7) throw new Error('贡献日历页面的格式变了，没有解析出日期');
  return { total: days.reduce((n, d) => n + d.count, 0), days };
}
