import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Location } from './config.ts';
import type { Sky } from './data.ts';
import { previewSky, skyAt, skyIn, sunTimes, weatherKind } from './sky.ts';

const TOKYO: Location = { timeZone: 'Asia/Tokyo', timeZoneName: 'JST', latitude: 35.68, longitude: 139.69 };

/** 东京当地时间的时:分 */
const hm = (ms: number): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }).format(ms);
const minutes = (s: string): number => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

test('日出日落时间和天文台的数据相差不到两分钟', () => {
  // 东京的夏至和冬至
  const cases: [string, string, string][] = [
    ['2026-06-21', '04:25', '19:00'],
    ['2026-12-21', '06:47', '16:32'],
  ];
  for (const [date, rise, set] of cases) {
    const t = sunTimes(date, TOKYO.latitude, TOKYO.longitude);
    assert.ok(Math.abs(minutes(hm(t.rise)) - minutes(rise)) <= 2, `${date} 日出 ${hm(t.rise)}`);
    assert.ok(Math.abs(minutes(hm(t.set)) - minutes(set)) <= 2, `${date} 日落 ${hm(t.set)}`);
  }
});

test('按日出日落分时段；黄昏过后等的是明天的日出，过了午夜也不变', () => {
  const at = (time: string) => skyAt(Date.parse(`${time}+09:00`), TOKYO);
  assert.deepEqual(at('2026-10-22T03:00:00'), { phase: 'night', event: 'sunrise', at: '05:53 JST' });
  assert.equal(at('2026-10-22T05:30:00').phase, 'dawn');
  assert.deepEqual(at('2026-10-22T12:00:00'), { phase: 'day', event: 'sunset', at: '16:58 JST' });
  assert.equal(at('2026-10-22T16:30:00').phase, 'dusk');
  assert.deepEqual(at('2026-10-22T22:00:00'), { phase: 'night', event: 'sunrise', at: '05:54 JST' });
  assert.deepEqual(at('2026-10-23T00:30:00'), at('2026-10-22T22:00:00'));
  // 没写时区名时由 Intl 生成
  assert.equal(skyAt(Date.parse('2026-10-22T12:00:00+09:00'), { ...TOKYO, timeZoneName: undefined }).at, '16:58 GMT+9');
});

test('预览时指定时段，日出日落时间按那一天算；只换天气时沿用快照里的时间', () => {
  assert.deepEqual(skyIn('dusk', '2026-10-22', TOKYO), { phase: 'dusk', event: 'sunset', at: '16:58 JST' });
  assert.deepEqual(skyIn('dawn', '2026-10-22', TOKYO), { phase: 'dawn', event: 'sunrise', at: '05:53 JST' });
  const fetched: Sky = { phase: 'night', event: 'sunrise', at: '05:54 JST', weather: 'overcast' };
  assert.deepEqual(previewSky(fetched, TOKYO, '2026-10-22', 'dusk', 'rain'), {
    phase: 'dusk',
    event: 'sunset',
    at: '16:58 JST',
    weather: 'rain',
  });
  assert.deepEqual(previewSky(fetched, TOKYO, '2026-10-22', undefined, 'snow'), { ...fetched, weather: 'snow' });
  assert.deepEqual(previewSky(fetched, TOKYO, '2026-10-22', 'day'), { ...skyIn('day', '2026-10-22', TOKYO), weather: 'overcast' });
  // 快照里还没有天色时，只换天气就按夜里算
  assert.deepEqual(previewSky(null, TOKYO, '2026-10-22', undefined, 'fog'), {
    ...skyIn('night', '2026-10-22', TOKYO),
    weather: 'fog',
  });
});

test('天气代码归成几类', () => {
  const cases: [number, string][] = [
    [0, 'clear'],
    [1, 'clear'],
    [2, 'cloudy'],
    [3, 'overcast'],
    [45, 'fog'],
    [53, 'drizzle'],
    [63, 'rain'],
    [81, 'rain'],
    [73, 'snow'],
    [86, 'snow'],
    [95, 'storm'],
    [99, 'storm'],
  ];
  for (const [code, kind] of cases) assert.equal(weatherKind(code), kind, `代码 ${code}`);
});
