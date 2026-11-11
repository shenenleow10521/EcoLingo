"use strict";

(() => {
  const config = window.ECOLINGO_CONFIG || {};
  const client = config.supabaseUrl && config.supabaseKey && window.supabase
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
        auth: { storageKey: "ecolingo-google-session", flowType: "pkce", detectSessionInUrl: true },
      })
    : null;

  function googleUser(user) {
    const metadata = user?.app_metadata;
    return !!user && !user.is_anonymous
      && (metadata?.provider === "google" || metadata?.providers?.includes("google"));
  }

  function appUrl() {
    return new URL("app.html", location.href);
  }

  async function signIn() {
    if (!client) throw new Error("Google sign-in is unavailable right now.");
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: appUrl().href, queryParams: { prompt: "select_account" } },
    });
    if (error) throw error;
  }

  if (client && new URLSearchParams(location.search).has("code")) {
    client.auth.getSession().then(({ data, error }) => {
      if (error || !data.session) return;
      const current = new URL(location.href);
      current.searchParams.delete("code");
      current.searchParams.delete("sb_flow_id");
      history.replaceState(null, "", current.href);
    }).catch(() => {});
  }

  window.EcoLingoAuth = { client, googleUser, appUrl, signIn };
})();
