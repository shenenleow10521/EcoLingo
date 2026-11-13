# EcoLingo 登录与排行榜

首页支持 Google OAuth 和游客昵称。两种玩家共用同一个排行榜，按马来西亚时间每周一开始新一周。
游客使用本浏览器保存的随机凭据恢复自己的进度，数据库只保存该凭据的哈希。清除浏览器数据后，游客仍可在榜上看到原分数，但无法恢复原档案。

## Supabase

1. 新 [Supabase 项目](https://supabase.com/dashboard/project/xindohtmqpwzgwdggdwx) 已应用 `supabase/google_accounts.sql`，迁移版本为 `20261111144210`。
2. 在同一项目执行 `supabase/guest_players.sql`。原站点使用另一个 Supabase 项目，旧账号和积分留在原项目。
3. 在 **Authentication → URL Configuration** 加入确切的回跳网址
   - Sites 版：`https://ecolingo-pc-preview.leowshenen.chatgpt.site/app.html`
   - 如发布到 GitHub Pages：`https://shenenleow10521.github.io/EcoLingo/app.html`
   - 本地开发按需加入 `http://127.0.0.1:4173/app.html`
4. 在 **Authentication → Sign In / Providers → Google** 启用 Google，把 Google OAuth Web Client ID 和 Client Secret 填在此处。项目网页的 `config.js` 只用项目 URL 和公开的 publishable key。

## Google Auth Platform

1. 在 [Google Auth Platform](https://console.cloud.google.com/auth/clients) 使用 Web application 类型的 OAuth client。
2. Authorized JavaScript origins 加入使用的站点 origin，例如 `https://ecolingo-pc-preview.leowshenen.chatgpt.site`。
3. Authorized redirect URIs 加入 Supabase 提供的 callback
   `https://xindohtmqpwzgwdggdwx.supabase.co/auth/v1/callback`。
4. Audience 使用 **External**。若要让测试名单以外的 Google 用户登入，请将发布状态设为 **In production**。设置细节见 [Supabase Google 登录指南](https://supabase.com/docs/guides/auth/social-login/auth-google)。

## 发布前验证

- 在无痕窗口直接开 `app.html`，应回到首页的登录和游客选项。
- 分别用 Google 和游客模式完成一项课程或挑战。确认两位玩家同时出现在 **This week** 和 **All time**。刷新游客页面验证进度恢复，再用另一浏览器验证 Google 账号进度恢复。
- 登出并切换账号，确认上一位玩家的数据没有出现在下一位玩家的工作区。
- 新版排行榜按去重后的学习事件计算积分。应用提交这些学习事件，排行榜仅返回昵称、分数和名次。
