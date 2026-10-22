// 抓取主页需要的数据，写入 data/snapshot.json。
//
//   node src/fetch.ts
//
// 有 token（PROFILE_TOKEN、GITHUB_TOKEN 或 GH_TOKEN）时用 GraphQL 一次取全；没有时改用公开的
// REST 接口和贡献日历页面，这时拿不到「活动概览」的细分数据。每个数据源单独抓取，
// 失败了就沿用上一次的数据，主页上不会出现空白。
import { config } from './config.ts';
import { readSnapshot, SNAPSHOT_PATH, type Sky, type Snapshot, stableRepos, writeSnapshot } from './data.ts';
import { fetchCalendarPage, fetchGraphql, fetchRestRepos, fetchRestUser, githubToken } from './github.ts';
import { fetchWeather, skyAt } from './sky.ts';

/** 失败时打印警告并返回 null；在 GitHub Actions 里显示成 warning 注释 */
async function attempt<T>(label: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (e) {
    const msg = `${label}获取失败，沿用上一次的数据：${e instanceof Error ? e.message : String(e)}`;
    console.warn(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : `warning: ${msg}`);
    return null;
  }
}

const { login } = config;
const saved = await readSnapshot();
// 换了用户名时，旧数据不能再用
const prev = saved?.login === login ? saved : null;
const token = githubToken();
console.log(token ? `使用 ${token.name}` : '没有 token：改用公开接口抓取，活动概览和私有仓库的统计沿用上一次的数据');

const auth = token?.value ?? null;
const gql = token ? await attempt('GraphQL 数据', () => fetchGraphql(login, token.value)) : null;
const user = gql?.user ?? (await attempt('用户信息', () => fetchRestUser(login, auth))) ?? prev?.user ?? null;
const repos = stableRepos(
  gql?.repos ?? (await attempt('仓库列表', () => fetchRestRepos(login, auth))) ?? prev?.repos ?? [],
  login,
);
const calendar = gql?.calendar ?? (await attempt('贡献日历', () => fetchCalendarPage(login))) ?? prev?.calendar ?? null;
const activity = gql?.activity ?? prev?.activity ?? null;
const privateLanguages = gql?.privateLanguages ?? prev?.privateLanguages ?? [];
// 天色按现在的时间算；天气抓取失败时沿用上一次的
const { location } = config;
const sky: Sky | null = location
  ? {
      ...skyAt(Date.now(), location),
      weather: (await attempt('天气', () => fetchWeather(location))) ?? prev?.sky?.weather ?? null,
    }
  : null;

if (!user && !calendar) {
  console.error('用户信息和贡献日历都没有拿到，也没有上一次的数据，无法生成主页');
  process.exit(1);
}

const snapshot: Snapshot = {
  login,
  asOf: calendar?.days.at(-1)?.date ?? new Date().toISOString().slice(0, 10),
  user,
  repos,
  calendar,
  activity,
  privateLanguages,
  sky,
};
await writeSnapshot(snapshot);

const range = calendar ? `${calendar.total} 次（${calendar.days[0]?.date} ~ ${snapshot.asOf}）` : '无';
const overview = activity ? (gql ? '已更新' : '沿用上一次的数据') : '无（需要 token）';
console.log(`已写入 ${SNAPSHOT_PATH}：公开仓库 ${repos.length} 个，贡献 ${range}，活动概览${overview}`);
// 只打印数量，私有仓库的名字不出现在日志里
console.log(
  `私有仓库：提交 ${activity?.privateCommits ?? 0} 次，语言 ${privateLanguages.length} 种；令牌看不到的私有贡献 ${activity?.restricted ?? 0} 次`,
);
console.log(
  sky
    ? `天色：${sky.phase}（${sky.event} ${sky.at}），天气：${sky.weather ?? '无'}`
    : '没有配置 location：贡献城市一直是没有天气的夜晚',
);
