"use strict";

(() => {
  const config = window.ECOLINGO_CONFIG || {};
  const guestStorage = "ecolingo-guest-account";
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

  function appUrl(mode) {
    const url = new URL("app.html", location.href);
    if (mode === "guest") url.searchParams.set("mode", mode);
    return url;
  }

  function readGuest() {
    try {
      const guest = JSON.parse(localStorage.getItem(guestStorage));
      if (/^[0-9a-f]{64}$/.test(guest?.key)) return guest;
    } catch {}
    return null;
  }

  function storeGuest(guest) {
    localStorage.setItem(guestStorage, JSON.stringify(guest));
  }

  function guestProfile(key, nick) {
    return client.rpc("get_ecolingo_guest_profile", { p_guest_key: key, p_nick: nick ?? null });
  }

  async function startGuest(nick) {
    if (!client) throw new Error("EcoLingo could not connect. Please try again.");
    let guest = readGuest();
    if (!guest) {
      const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte =>
        byte.toString(16).padStart(2, "0")).join("");
      guest = { key, nick };
      storeGuest(guest);
    }
    const { data, error } = await guestProfile(guest.key, nick);
    if (error) throw error;
    const profile = data?.[0];
    if (!profile) throw new Error("Your guest profile could not be loaded.");
    if (profile.nick !== nick) {
      const { data: renamed, error: renameError } = await client.rpc("save_ecolingo_guest_profile", {
        p_guest_key: guest.key, p_nick: nick, p_state: profile.state,
        p_revision: profile.revision, p_epoch: profile.epoch,
      });
      if (renameError) throw renameError;
      if (!renamed?.length) throw new Error("Guest progress changed. Please try again.");
    }
    storeGuest({ ...guest, nick });
  }

  async function signIn() {
    if (!client) throw new Error("Google sign-in is unavailable right now.");
    const settings = await fetch(new URL("/auth/v1/settings", config.supabaseUrl), {
      headers: { apikey: config.supabaseKey },
    });
    if (!settings.ok) throw new Error("Google sign-in could not connect.");
    if (!(await settings.json()).external?.google) {
      throw new Error("Google sign-in is awaiting setup. You can play as a guest now.");
    }
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

  window.EcoLingoAuth = { client, googleUser, appUrl, signIn, readGuest, storeGuest, guestProfile, startGuest };
})();
