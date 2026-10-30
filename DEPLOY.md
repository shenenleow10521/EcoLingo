# EcoLingo 部署指南：从原型到有 backend 的真 app

完成后你会有：

- 一个公开网址（例如 `https://shenenleow10521.github.io/EcoLingo/`），谁都能打开
- **真的 backend**：进度存在云端数据库，换浏览器/换手机都在
- **真的排行榜**：显示所有真实用户，不再是写死的示例玩家
- 社区目标进度条显示全体用户本周真实 check-in 数
- 用 email 登录，跨设备同步
- 可以「加到主屏幕」像 app 一样打开（PWA），断网也能开

全部免费，不需要信用卡。

---

## 0. 架构：它是怎么运作的

```
 手机 / 电脑浏览器
 ┌──────────────────────────┐
 │ index.html  (前端)        │  ← 放在 GitHub Pages（免费静态托管）
 │ config.js   (连接设定)     │
 │ sw.js + manifest (PWA)   │
 └────────────┬─────────────┘
              │ HTTPS (supabase-js)
              ▼
 ┌──────────────────────────┐
 │ Supabase (backend)        │
 │  • Auth：游客 / email 登录 │
 │  • Postgres：profiles 表   │  ← schema.sql 建的
 │  • RLS：只能改自己的数据     │
 │  • RPC：排行榜、社区总数     │
 └──────────────────────────┘
```

**为什么用 Supabase 而不是自己写 Node/Express server？**
Supabase 已经帮你把「登录 + 数据库 + API」做好了，前端直接安全地连数据库。
安全不是靠隐藏 key，而是靠数据库里的 **Row Level Security (RLS)** 规则：每个用户只能读/写自己那一行。
自己写 Express 也可以（下面「下一步」有提），但对一个课程项目来说要多管 server、部署、休眠等问题。

**数据流程**

1. 第一次打开 → 自动以「游客」身份登录（anonymous sign-in），不用填任何东西
2. 每次拿分数 / check-in / 改昵称 → 先存浏览器（localStorage），0.8 秒后同步到 Supabase
3. 排行榜 / 社区目标 → 调用数据库函数 `get_leaderboard`、`community_week_checkins`
4. 想换设备 → 在头像里输入 email → 点邮件里的登录链接，游客进度会**合并**进账号
5. `config.js` 留空 = 离线模式（跟原本的原型一模一样），方便 demo

---

## 1. 建 Supabase 项目（5 分钟）

1. 去 <https://supabase.com> → **Start your project** → 用 GitHub 登录
2. **New project**
   - Name：`ecolingo`
   - Database Password：随便生成一个，记下来（这个 app 用不到，但以后可能要）
   - Region：**Southeast Asia (Singapore)** ← 离马来西亚最近，最快
3. 等 1–2 分钟项目建好

## 2. 建数据库表（跑 schema.sql）

1. 左边菜单 **SQL Editor** → **New query**
2. 打开本 repo 的 `supabase/schema.sql`，全部复制贴进去
3. 按 **Run**，看到 `Success. No rows returned` 就对了
4. 去 **Table Editor** 应该会看到一个 `profiles` 表（现在是空的）

> 这份 SQL 建了：`profiles` 表（每个用户一行：昵称 + 进度 JSON）、RLS 规则、排行榜函数、社区总数函数。可以重复执行。

## 3. 打开登录方式

左边 **Authentication** → **Sign In / Providers**（有些版本叫 **Providers**）：

1. 打开 **Allow anonymous sign-ins** → Save
   （没开的话 app 会连不上，进度只存本机，console 会提示）
2. **Email** provider 保持开启（默认就是开的）

## 4. 设定 email 登录跳回的网址

**Authentication → URL Configuration**：

- **Site URL**：上线后填 `https://shenenleow10521.github.io/EcoLingo/`（在电脑测试时可先填 `http://127.0.0.1:5500`）
- **Redirect URLs** 加上这两个：
  - `http://127.0.0.1:5500/**`（VS Code Live Server 本地测试用）
  - `https://shenenleow10521.github.io/EcoLingo/**`（上线后用）

登录流程：头像 → 输入 email → Send code → 邮件里点 **Sign in** 链接 → 回到 app 自动登录。
**要在同一台设备、同一个浏览器打开邮件链接**（安全机制：链接只认发出请求的那个浏览器）。

> ⚠️ 免费项目用 Supabase 自带的寄信服务时**不能改邮件模板**，而且每小时只能寄很少几封，给小组测试够用。
> 想改成寄验证码、或给全班用 → **Authentication → Emails → SMTP Settings** 接一个免费 SMTP（例如 Resend、Brevo），
> 然后把 Magic Link / Confirm sign up 模板改成包含 `{{ .Token }}`。app 两种方式都支持（输入框接受 6–8 位码）。

## 5. 把 key 填进 config.js

1. **Project Settings**（齿轮）→ **API Keys** / **Data API**
2. 复制：
   - **Project URL**：`https://xxxx.supabase.co`
   - **Publishable key**：`sb_publishable_...`（旧项目显示为 **anon public** key，也可以用）
3. 打开 `config.js` 填进去：

```js
window.ECOLINGO_CONFIG = {
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseKey: "sb_publishable_xxxxxxxx"
};
```

> ✅ Publishable / anon key **可以**放上 GitHub，它本来就是给浏览器用的。
> ❌ **secret / service_role key 绝对不能**放进前端或 GitHub —— 它能绕过 RLS 改所有人的数据。

## 6. 在自己电脑先测试

不能直接双击 `index.html`（`file://` 下 service worker 不能用），开个本地 server：

```bash
cd EcoLingo
python3 -m http.server 8000
# 或者：npx serve .
```

打开 <http://localhost:8000>，检查：

- [ ] 点头像 → 看到 **Account and sync** 和「● Saved to the cloud」
- [ ] 做一次 Challenge check-in → Supabase **Table Editor → profiles** 出现一行，`state` 里有你的 check-in
- [ ] 用另一个浏览器（或无痕模式）打开 → 排行榜看到第一个人
- [ ] 头像 → 输入 email → Send code → 在同一个浏览器点邮件里的链接 → 显示「Signed in as …」

如果显示「Offline…」：按 F12 看 Console 的提示（通常是第 3 步没开 anonymous sign-ins，或 key 贴错）。

## 7. 上线：GitHub Pages

```bash
git add .
git commit -m "Add Supabase backend + PWA"
git push
```

然后在 GitHub repo：

1. **Settings → Pages**
2. Source：**Deploy from a branch**
3. Branch：`main`，folder：`/ (root)` → Save
4. 等 1–2 分钟，网址会是 `https://shenenleow10521.github.io/EcoLingo/`

回到 Supabase：**Authentication → URL Configuration**，Site URL 改成这个网址，Redirect URLs 也加上它（见第 4 步）。

> 想要更好看的网址？也可以用 **Vercel** 或 **Netlify**：Import GitHub repo，Framework 选 "Other"，不用 build command，直接 Deploy。之后每次 `git push` 都会自动更新。

## 8. 装到手机上

- **Android（Chrome）**：打开网址 → 右上角 ⋮ → **Install app / 加到主屏幕**
- **iPhone（Safari）**：打开网址 → 分享按钮 → **加到主屏幕**

打开后是全屏、有自己的图标，跟 app 一样。

> 改了代码重新部署后，手机可能还显示旧版：把 `sw.js` 第一行的 `VERSION` 改成 `ecolingo-v2`（v3…）再 push，手机下次打开就会更新。

---

## 9. 改了哪些文件

| 文件 | 作用 |
|---|---|
| `index.html` | 加了 Supabase 连接、云端同步、真排行榜、email 登录、PWA 注册。`config.js` 留空时行为跟原本原型一样 |
| `config.js` | 填 Supabase URL + publishable key |
| `supabase/schema.sql` | 数据库表、RLS 安全规则、排行榜/社区函数 |
| `manifest.webmanifest` + `icons/` | PWA：名称、颜色、图标 |
| `sw.js` | Service worker：离线打开、加速 |

主要逻辑都在 `index.html` 里 `/* ---------- cloud sync ---------- */` 那一段，可以读一读：

- `cloudSave()` — 把进度 upsert 进 `profiles`
- `adoptUser()` — 登录后从云端拿进度，跟本机进度合并
- `mergeState()` — 合并规则：课程/徽章取并集、quiz 取最高分、每天分数取较大值
- `refreshShared()` — 拿排行榜和社区总数
- `sendCode()` / `verifyCode()` / `signOut()` — email 登录（链接或验证码）

## 10. 已知限制 & 下一步（报告里可以写）

1. **分数是前端算的** → 懂技术的人可以改 JS 刷分。下一步：把「完成课程 / 答对题 / check-in」写成数据库函数（Supabase RPC 或 Edge Function），由 server 判断该给几分。
2. **Quiz 可以重复刷分**（原型本来的设计）。可以改成只有第一次或刷新最高分时才给分。
3. **免费 Supabase 项目一段时间没人用会被暂停** → 去 dashboard 按 Restore 就好；正式上线前记得打开看看。
4. **游客账号会累积**：清掉浏览器数据的人会留下旧的游客行。可以定期在 SQL Editor 删掉 0 分又很久没更新的行：
   ```sql
   delete from public.profiles
   where updated_at < now() - interval '30 days'
     and coalesce(jsonb_array_length(state->'log'), 0) = 0;
   ```
5. **上 Play Store**：用 <https://www.pwabuilder.com> 输入你的网址，可以直接打包成 Android app（TWA）；或用 Capacitor 包成原生 app。
6. **UM 账号登录**：Supabase 也支持 Google / Microsoft 登录（Authentication → Providers），可以限制只有 `@siswa.um.edu.my` 能玩。
