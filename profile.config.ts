// 主页生成器的配置。改完运行 `pnpm readme` 在本地重新生成；推送后 GitHub Actions 也会重新生成。
import type { ProfileConfig } from './src/config.ts';

// 常用的编程语言：大标题下面的简介和信息栏的 langs 一行都用它
const stack = ['Rust', 'Go', 'TypeScript', 'Python', 'Ruby'];

export default {
  login: 'ZoveRKI',
  host: 'ZoveRKI@github',
  // 之前的简介：Rust · TypeScript · Python — building OneByOne, one step at a time.
  tagline: stack.join(' · '),
  stack,

  projects: [
    {
      repo: 'OneByOne',
      description:
        'Understand AI code changes one step at a time: a change is split into ordered steps, each showing its own diff and explanation.',
    },
    {
      repo: 'Voice-Synthesis',
      description: 'Text-to-speech with edge-tts, plus scripts that tag MP3 metadata and merge audio files.',
    },
  ],

  // 技术栈板块：一组一行，按这里的顺序显示；条目和 GitHub 语言统计里的语言同名时会带上语言的颜色
  techStack: {
    languages: ['Rust', 'Go', 'TypeScript', 'JavaScript', 'Python', 'Ruby'],
    frontend: ['React', 'Vite'],
    // Web 框架
    backend: ['axum', 'Gin', 'Rails'],
    // 异步运行时和序列化，不只用在后端
    libraries: ['tokio', 'serde'],
    // 数据库相关的库和工具：SQL 工具包、PostgreSQL 驱动、迁移工具
    'db-tools': ['sqlx', 'pgx', 'goose'],
    databases: ['PostgreSQL', 'MySQL', 'SQLite', 'Redis'],
    cloud: ['AWS', 'GCP'],
  },

  // 所在地：贡献城市的天色（夜里、黎明、白天、黄昏）跟着这里的日出日落变，天气是这里的实时天气。
  // 经纬度精确到城市就够了，抓取数据时会发给 Open-Meteo 查天气；时区和日出日落时间会显示在主页上
  location: { timeZone: 'Asia/Tokyo', timeZoneName: 'JST', latitude: 35.68, longitude: 139.69 },

  // 语言占比：HTML、Shell 这类标记、样式和构建脚本语言（清单见 src/config.ts 的 OTHER_LANGUAGES），
  // 以及占比不到 1% 的语言，都归入 Other；show 里的语言从清单里拿出来单独显示。
  // 其他可调的项，例如：{ other: ['HTML', 'Shell'], min: 2, max: 6 }
  languages: { show: ['CSS', 'SCSS'] },

  // 头部下面的一排链接按钮，例如：
  // links: [{ label: 'Blog', url: 'https://example.com', note: 'example.com' }],

  // 头部信息栏里额外显示的条目，例如：
  // facts: [['editor', 'VS Code']],

  // 板块和顺序：
  // sections: ['contributions', 'activity', 'languages', 'stack', 'projects'],
} satisfies ProfileConfig;
