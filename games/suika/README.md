# 合成大西瓜 · Personal Space

访问地址：https://zat666-ctrl.github.io/personal-space/games/suika/

首页工具栏「🎮 小游戏」→「合成大西瓜」。沿用 Personal Space 的玻璃卡片、配色及明暗主题设置。

## 操作

- 鼠标移动瞄准，单击投放；触屏拖动后松手投放，取消手势不会投放。
- 游戏画布获得焦点后，左右方向键瞄准、空格投放、P 暂停。
- 暂停、静音、重新开始可使用下方按钮。离开页面会自动暂停；重开确认保留最高分。
- 水果持续超过虚线才判负；新投放水果有宽限时间。

## 结构与物理

基于 QuangLe1997/suika-merge 的果实实体、工厂、粒子模块、配色和原图适配。
保留 MIT 声明，详见 [THIRD_PARTY.md](THIRD_PARTY.md) 和原始 [UPSTREAM-README.md](UPSTREAM-README.md)。
原项目当前快照 README 声明 MIT，没有单独 LICENSE，也没有单独说明图片来源/许可。
未引入广告、模拟激励广告、金币、道具、复活、商业 SDK、原项目 Service Worker。

Matter.js 0.20.0 和 Supabase JS 2.49.4 UMD 文件随站点发布，版本固定，许可证随附。
11 级果实使用固定逻辑坐标，物理模拟 120 Hz 子步、10 次位置迭代、8 次速度迭代。
渲染通过 requestAnimationFrame 与位置插值执行，设备像素比限制为 2。
合成在物理步结束后处理，立即锁定成对果实，避免重复合成；新增果实限制在边界内。
弹性缩放只影响绘制，不修改碰撞体。粒子池固定上限；休眠减少静止堆叠的物理开销。

## 存档与同步

复用现有构建变量 `SUPABASE_URL` 和 `SUPABASE_PUBLISHABLE_KEY`，以及邮箱密码登录。
原首页客户端、登录代码、已有业务表和存储桶均不改动。
SDK 默认使用相同的 Supabase 会话 storage key，因此同源首页登录后游戏可恢复登录会话。
匿名临时 Auth 用户不会当作跨设备账号；不创建假身份。

`personal-space-suika-best-v1:guest` 保存游客成绩；以真实 Auth user ID 为后缀的独立 key 保存账号成绩。
游客成绩不会自动归入后来登录的账号，不同账号互不继承纪录。切换身份会开启并暂停新一局。
每次刷新最高分立即本地保存，云请求短暂合并后发送；登录、联网、重新打开页面时读取云端纪录。
读取与写入均取最大值。服务端触发器在并发更新时也只保留较高纪录。
失败以 2–60 秒退避重试；断网可继续游玩，刷新后继续读取本地最高分。
浏览器禁用存储时显示明确提示并保留当前页面内存记录。

独立表 `public.suika_scores`：`user_id` 外键主键、非负 `best_score`、服务端时间戳。
RLS 和列权限限制真实用户读写自己的成绩，游客无权限，客户端无删除权限、不可改所有者或时间戳。
迁移位于 `supabase/migrations/20261118121417_suika_scores.sql`，可重复执行。
迁移不覆盖已有业务表、策略、存储桶和通用函数。

**成绩由前端报告，不是服务端验证的比赛成绩，不能声称完全防作弊。**
RLS 保护的是账号之间的数据隔离。若未来做可信排行榜，需要服务端重放/验证游戏过程。

## 构建、部署、验证

```text
npm ci --ignore-scripts
npm test
npm run build
npm run preview
npm run test:browser
```

构建使用现有 `.env.local` 或 CI 变量。只允许公开 publishable / legacy anon key；严禁私密服务密钥。
预览地址为 `http://127.0.0.1:4173/personal-space/`，模拟 GitHub Pages 项目子路径。
浏览器测试默认使用 Windows 已安装的 Chrome / Edge，可设 `CHROME_PATH`。
其他环境可运行 `npx playwright install chromium` 后测试。
设 `SUIKA_TEST_URL` 可复用浏览器测试检查线上站点；测试使用独立临时浏览器上下文。

沿用 `.github/workflows/deploy.yml`，先运行物理/存档/Postgres RLS 测试，再构建并部署 Pages。
没有 SPA history 路由；每个路径都有实际 index.html，刷新不会依赖根目录回退。
仅注册原根目录 Service Worker，更新缓存版本并预缓存所有游戏运行资源；不缓存 Supabase API。

`tests/suika-rls.sql` 是线上 PostgreSQL 事务测试：只模拟数据库角色，使用已有 Auth 用户外键，
验证本人读写、越权拒绝、游客拒绝及最高分单调性，最后回滚所有测试成绩，不创建账号或登录凭据。
前端同步单元测试覆盖离线重试、云端较高分、另一设备恢复和账号隔离。
浏览器测试覆盖桌面/手机触屏视口、实际合成计分、暂停重开静音、键盘、缩放与离线刷新游玩。
模拟手机视口不等于真实手机硬件实测；60 FPS 是优化目标，受实际设备、刷新率和系统负载影响。
