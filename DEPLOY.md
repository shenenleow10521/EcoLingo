# EcoLingo Google 登录与排行榜

新版首页使用 Google OAuth。普通 Gmail 或其他可用的 Google 账号都能登录。
排行榜显示昵称、同步后的积分和名次，按马来西亚时间每周一开始新一周。

## Supabase

1. 打开 [现有项目](https://supabase.com/dashboard/project/jqivhiozysizqnbtpfkn)，确认项目可用。
2. 在 **SQL Editor** 执行 `supabase/google_accounts.sql`。此迁移建立 Google 版独立档案、进度同步和排行榜。同一账号已有的进度会按用户 ID 导入一次。
3. 在 **Authentication → URL Configuration** 加入确切的回跳网址
   - Sites 版：`https://ecolingo-pc-preview.leowshenen.chatgpt.site/app.html`
   - 如发布到 GitHub Pages：`https://shenenleow10521.github.io/EcoLingo/app.html`
   - 本地开发按需加入 `http://127.0.0.1:4173/app.html`
4. 在 **Authentication → Sign In / Providers → Google** 启用 Google，把 Google OAuth Web Client ID 和 Client Secret 填在此处。项目网页的 `config.js` 只用项目 URL 和公开的 publishable key。

## Google Auth Platform

1. 在 [Google Auth Platform](https://console.cloud.google.com/auth/clients) 使用 Web application 类型的 OAuth client。
2. Authorized JavaScript origins 加入使用的站点 origin，例如 `https://ecolingo-pc-preview.leowshenen.chatgpt.site`。
3. Authorized redirect URIs 加入 Supabase 提供的 callback
   `https://jqivhiozysizqnbtpfkn.supabase.co/auth/v1/callback`。
4. Audience 使用 **External**。若要让测试名单以外的 Google 用户登入，请将发布状态设为 **In production**。设置细节见 [Supabase Google 登录指南](https://supabase.com/docs/guides/auth/social-login/auth-google)。

## 发布前验证

- 在无痕窗口直接开 `app.html`，应回首页要求 Google 登录。
- 用两个不同 Google 账号进入，分别完成一项课程或挑战。确认各自的昵称和分数同时出现在 **This week** 和 **All time**，并能在另一浏览器重新登入同账号看回进度。
- 登出并切换账号，确认上一位玩家的数据没有出现在下一位玩家的工作区。
- 新版排行榜按去重后的学习事件计算积分。应用提交这些学习事件，排行榜仅返回昵称、分数和名次。
