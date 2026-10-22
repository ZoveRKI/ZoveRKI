// 所在地的天色和天气：按日出日落把一天分成夜里、黎明、白天、黄昏四个时段，天气查 Open-Meteo 的免费接口。
// 抓取数据时算好写进 data/snapshot.json，渲染只看快照：同样的快照画出同样的图，
// 一天里只有换时段、变天的时候图才会变。
import type { Location } from './config.ts';
import type { Phase, Sky, Weather } from './data.ts';
import { UA } from './github.ts';

const MINUTE = 60_000;
const DAY_MS = 86_400_000;
const RAD = Math.PI / 180;

/** 黎明从日出前 45 分钟到日出后 45 分钟，黄昏从日落前 60 分钟到日落后 45 分钟 */
const DAWN = { before: 45, after: 45 };
const DUSK = { before: 60, after: 45 };

/**
 * 某一天的日出和日落时刻（毫秒时间戳），用 NOAA 的太阳位置近似公式计算，误差在一两分钟以内。
 * 极夜时日出日落都算在正午，极昼时日出在正午前 12 小时、日落在正午后 12 小时。
 */
export function sunTimes(date: string, latitude: number, longitude: number): { rise: number; set: number } {
  const day = Date.parse(`${date}T00:00:00Z`);
  const year = new Date(day).getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  // 一年转一圈的角度，1 月 1 日是 0
  const g = ((2 * Math.PI) / ((Date.UTC(year + 1, 0, 1) - start) / DAY_MS)) * ((day - start) / DAY_MS);
  // 均时差（分钟）和太阳赤纬（弧度）
  const eqTime =
    229.18 *
    (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  // 太阳中心在地平线下 0.833°（大气折射加上太阳半径）时的时角，每度对应 4 分钟
  const lat = latitude * RAD;
  const cos = Math.cos(90.833 * RAD) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl);
  const ha = Math.acos(Math.min(1, Math.max(-1, cos))) / RAD;
  // 当地正午是 UTC 当天的第几分钟
  const noon = 720 - 4 * longitude - eqTime;
  return { rise: day + (noon - 4 * ha) * MINUTE, set: day + (noon + 4 * ha) * MINUTE };
}

/** 时间戳在所在地是哪一天，格式是 2026-10-22 */
const localDate = (ms: number, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

const nextDay = (date: string): string => new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/** 所在地的时刻，比如 05:51 JST */
function clock(ms: number, loc: Location): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: loc.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).formatToParts(Math.round(ms / MINUTE) * MINUTE);
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('hour')}:${part('minute')} ${loc.timeZoneName ?? part('timeZoneName')}`;
}

/** now 时刻所在地的时段，以及这个时段对应的日出或日落时间 */
export function skyAt(now: number, loc: Location): Omit<Sky, 'weather'> {
  const date = localDate(now, loc.timeZone);
  const { rise, set } = sunTimes(date, loc.latitude, loc.longitude);
  if (now < rise - DAWN.before * MINUTE) return { phase: 'night', event: 'sunrise', at: clock(rise, loc) };
  if (now < rise + DAWN.after * MINUTE) return { phase: 'dawn', event: 'sunrise', at: clock(rise, loc) };
  if (now < set - DUSK.before * MINUTE) return { phase: 'day', event: 'sunset', at: clock(set, loc) };
  if (now < set + DUSK.after * MINUTE) return { phase: 'dusk', event: 'sunset', at: clock(set, loc) };
  // 黄昏过后，等的是明天的日出
  return { phase: 'night', event: 'sunrise', at: clock(sunTimes(nextDay(date), loc.latitude, loc.longitude).rise, loc) };
}

/** 本地预览用：指定时段，日出日落时间按 date 那天算 */
export function skyIn(phase: Phase, date: string, loc: Location): Omit<Sky, 'weather'> {
  const { rise, set } = sunTimes(date, loc.latitude, loc.longitude);
  return phase === 'night' || phase === 'dawn'
    ? { phase, event: 'sunrise', at: clock(rise, loc) }
    : { phase, event: 'sunset', at: clock(set, loc) };
}

/** Open-Meteo 用的 WMO 天气代码归成几类；文档里没有的代码当成多云 */
export function weatherKind(code: number): Weather {
  if (code <= 1) return 'clear';
  if (code === 2) return 'cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'storm';
  return 'cloudy';
}

const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';

/** 所在地现在的天气。Open-Meteo 的免费接口不需要 key，请求里只有经纬度，不带任何令牌 */
export async function fetchWeather(loc: Location): Promise<Weather> {
  const url = `${WEATHER_API}?latitude=${loc.latitude}&longitude=${loc.longitude}&current=weather_code`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}（${url}）`);
  const code = ((await res.json()) as { current?: { weather_code?: unknown } }).current?.weather_code;
  if (typeof code !== 'number') throw new Error('返回的数据里没有 weather_code');
  return weatherKind(code);
}
