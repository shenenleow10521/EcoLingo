// EcoLingo backend config
// 1. Supabase Dashboard → Project Settings → API Keys / Data API
// 2. 把 Project URL 和 Publishable key（以 sb_publishable_ 开头；旧项目叫 anon public key）贴到下面
// 这个 key 本来就是给前端用的，可以公开放进 GitHub —— 数据安全靠 schema.sql 里的 RLS policy。
// ⚠️ 千万不要把 secret / service_role key 放在这里。
// 需要有效的 Supabase 项目才能登录和同步。
window.ECOLINGO_CONFIG = {
  supabaseUrl: "https://jqivhiozysizqnbtpfkn.supabase.co",   // EcoLingo SG (Singapore)
  supabaseKey: "sb_publishable_WucZVlas_9PftiIC0HweDw_Fg1l2w74"
};
