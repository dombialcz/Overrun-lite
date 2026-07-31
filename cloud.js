(function initOverrunCloud(global) {
  const EMPTY_STATE = { tasks: [], backlog: [] };
  const ACCOUNT_CACHE_PREFIX = "overrun_lite_state:";
  const ACCOUNT_REVISION_PREFIX = "overrun_lite_revision:";
  const SYNC_DELAY_MS = 750;

  let callbacks = {};
  let config = { auth: { enabled: false }, ai: { hostedAvailable: false } };
  let client = null;
  let session = null;
  let user = null;
  let revision = 0;
  let saveTimer = null;
  let pendingState = null;
  let syncPaused = false;
  let connectingUserId = null;
  let usage = null;
  let conflict = null;
  let authLinkError = "";

  async function init(nextCallbacks = {}) {
    callbacks = nextCallbacks;
    adoptAuthLinkModeFromFragment();
    authLinkError = readAuthLinkError();
    config = await loadConfig();
    emitCapabilities();
    if (!config.auth.enabled || !global.supabase || !global.supabase.createClient) {
      emitAuth();
      emitSync("Local only");
      return getSnapshot();
    }

    client = global.supabase.createClient(
      config.auth.url,
      config.auth.publishableKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: "implicit",
        },
      }
    );

    client.auth.onAuthStateChange((event, nextSession) => {
      session = nextSession;
      user = nextSession && nextSession.user ? nextSession.user : null;
      emitAuth();
      if (event === "SIGNED_OUT") {
        revision = 0;
        usage = null;
        syncPaused = false;
        conflict = null;
        callbacks.onUsage && callbacks.onUsage(null);
        callbacks.onGuest && callbacks.onGuest();
        emitSync("Local only");
      } else if (user && event !== "TOKEN_REFRESHED" && !isPasswordSetup()) {
        connectAccount(user).catch(() => emitSync("Offline"));
      }
    });
    global.addEventListener("online", () => {
      if (!user || syncPaused || !callbacks.getPlannerState) return;
      saveNow(callbacks.getPlannerState()).catch(() => emitSync("Offline"));
    });

    const hasAuthFragment = hasAuthLinkFragment();
    const authLinkSession = readAuthLinkSession();
    if (hasAuthFragment) clearAuthFragment();
    if (isPasswordSetup() && hasAuthFragment && !authLinkSession && !authLinkError) {
      authLinkError = authLinkFailureMessage();
    }
    if (authLinkSession) {
      const { data, error } = await client.auth.setSession(authLinkSession);
      if (error || !data || !data.session) {
        authLinkError = authLinkExpiredMessage();
      } else {
        authLinkError = "";
        session = data.session;
        user = session.user || null;
      }
    }

    const { data } = await client.auth.getSession();
    session = data && data.session ? data.session : null;
    user = session && session.user ? session.user : null;
    emitAuth();
    if (user && !isPasswordSetup()) await connectAccount(user);
    else emitSync("Local only");
    return getSnapshot();
  }

  async function loadConfig() {
    if (isKnownStaticHost()) {
      return { auth: { enabled: false }, ai: { hostedAvailable: false } };
    }
    try {
      const response = await fetch("/api/config", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Configuration unavailable");
      const loaded = await response.json();
      if (!loaded || !loaded.auth || !loaded.ai) throw new Error("Invalid configuration");
      return loaded;
    } catch (err) {
      return { auth: { enabled: false }, ai: { hostedAvailable: false } };
    }
  }

  function isKnownStaticHost() {
    if (global.__OVERRUN_FORCE_CONFIG__ === true) return false;
    const hostname = String(global.location.hostname || "");
    if (hostname.endsWith(".github.io")) return true;
    if (hostname === "127.0.0.1" || hostname === "localhost") {
      return global.location.port !== "3000";
    }
    return false;
  }

  async function signIn(email, password) {
    ensureClient();
    const { error } = await client.auth.signInWithPassword({
      email: String(email || "").trim(),
      password: String(password || ""),
    });
    if (error) throw new Error("Email or password is incorrect.");
  }

  async function requestPasswordReset(email) {
    ensureClient();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new Error("Enter your account email first.");
    }
    const redirect = new URL("/?recovery=1", global.location.origin);
    const { error } = await client.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: redirect.toString(),
    });
    if (error) throw new Error("Could not send a password reset email. Try again later.");
  }

  async function setPassword(password) {
    ensureClient();
    validatePassword(password);
    const { error } = await client.auth.updateUser({ password });
    if (error) throw new Error(error.message || "Could not set the password.");
    authLinkError = "";
    const url = new URL(global.location.href);
    url.searchParams.delete("activation");
    url.searchParams.delete("recovery");
    global.history.replaceState({}, "", `${url.pathname}${url.search}`);
    emitAuth();
    if (user) connectAccount(user).catch(() => emitSync("Offline"));
  }

  async function signOut() {
    if (!client || !user) return;
    const userId = user.id;
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw new Error("Could not sign out.");
    safeRemove(`${ACCOUNT_CACHE_PREFIX}${userId}`);
    safeRemove(`${ACCOUNT_REVISION_PREFIX}${userId}`);
  }

  function validatePassword(password) {
    const value = String(password || "");
    if (
      value.length < 12
      || !/[a-z]/.test(value)
      || !/[A-Z]/.test(value)
      || !/\d/.test(value)
    ) {
      throw new Error("Use at least 12 characters with upper and lowercase letters and a number.");
    }
  }

  async function connectAccount(nextUser) {
    if (!nextUser || connectingUserId === nextUser.id) return;
    connectingUserId = nextUser.id;
    emitSync("Loading");
    const localGuest = cloneState(
      callbacks.getPlannerState ? callbacks.getPlannerState() : EMPTY_STATE
    );
    const cacheKey = `${ACCOUNT_CACHE_PREFIX}${nextUser.id}`;

    try {
      const { data, error } = await client
        .from("planner_states")
        .select("state, revision, updated_at")
        .eq("user_id", nextUser.id)
        .maybeSingle();
      if (error) throw error;

      const cloudState = data ? cloneState(data.state) : null;
      revision = data ? Number(data.revision) || 0 : 0;
      const hasLocal = hasPlannerData(localGuest);
      const hasCloud = hasPlannerData(cloudState);
      let choice = "cloud";

      if (hasLocal && !sameState(localGuest, cloudState)) {
        choice = callbacks.chooseInitialSync
          ? await callbacks.chooseInitialSync({
              localState: localGuest,
              cloudState: cloudState || cloneState(EMPTY_STATE),
              hasCloud,
            })
          : "cloud";
      } else if (hasLocal && !cloudState) {
        choice = "local";
      }

      if (choice === "local") {
        const saved = await saveNow(localGuest, { allowConflictPrompt: false });
        if (!saved) throw new Error("Could not move local data into the account.");
        safeRemove("overrun_lite_state");
        activateAccount(nextUser.id, localGuest);
      } else {
        if (hasLocal && !sameState(localGuest, cloudState)) {
          safeRemove("overrun_lite_state");
        }
        activateAccount(nextUser.id, cloudState || EMPTY_STATE);
      }
      safeSet(cacheKey, JSON.stringify(callbacks.getPlannerState()));
      safeSet(`${ACCOUNT_REVISION_PREFIX}${nextUser.id}`, String(revision));
      emitSync("Synced");
      await refreshUsage();
    } catch (err) {
      const cached = readJson(cacheKey);
      if (cached) {
        revision = Number(safeGet(`${ACCOUNT_REVISION_PREFIX}${nextUser.id}`)) || 0;
        activateAccount(nextUser.id, cached);
      } else {
        activateAccount(nextUser.id, EMPTY_STATE);
      }
      emitSync("Offline");
    } finally {
      connectingUserId = null;
    }
  }

  function activateAccount(userId, plannerState) {
    callbacks.onAccount && callbacks.onAccount(userId, cloneState(plannerState));
  }

  function scheduleSave(plannerState) {
    if (!user || !client || syncPaused) return;
    pendingState = cloneState(plannerState);
    emitSync("Saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const next = pendingState;
      pendingState = null;
      saveNow(next).catch(() => emitSync("Offline"));
    }, SYNC_DELAY_MS);
  }

  async function saveNow(plannerState, options = {}) {
    if (!user || !client) return false;
    const localState = cloneState(plannerState);
    const { data, error } = await client.rpc("save_planner_state", {
      p_expected_revision: revision,
      p_state: localState,
    });
    if (error) {
      emitSync("Offline");
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Cloud save returned no state.");
    if (!row.saved) {
      conflict = {
        localState,
        cloudState: cloneState(row.state),
        cloudRevision: Number(row.revision) || 0,
      };
      syncPaused = true;
      emitSync("Conflict");
      if (options.allowConflictPrompt !== false && callbacks.onConflict) {
        callbacks.onConflict(conflict);
      }
      return false;
    }
    revision = Number(row.revision) || revision;
    safeSet(`${ACCOUNT_CACHE_PREFIX}${user.id}`, JSON.stringify(localState));
    safeSet(`${ACCOUNT_REVISION_PREFIX}${user.id}`, String(revision));
    emitSync("Synced");
    return true;
  }

  async function resolveConflict(choice) {
    if (!conflict || !user) return false;
    if (choice === "cloud") {
      revision = conflict.cloudRevision;
      activateAccount(user.id, conflict.cloudState);
      conflict = null;
      syncPaused = false;
      emitSync("Synced");
      return true;
    }
    const localState = conflict.localState;
    revision = conflict.cloudRevision;
    conflict = null;
    syncPaused = false;
    const saved = await saveNow(localState);
    if (saved) activateAccount(user.id, localState);
    return saved;
  }

  async function refreshUsage() {
    if (!session || !config.ai.hostedAvailable) {
      usage = null;
      callbacks.onUsage && callbacks.onUsage(null);
      return null;
    }
    try {
      const response = await fetch("/api/ai-usage", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Usage unavailable");
      usage = await response.json();
      callbacks.onUsage && callbacks.onUsage(usage);
      return usage;
    } catch (err) {
      return usage;
    }
  }

  function getAccessToken() {
    return session ? session.access_token : "";
  }

  function getSnapshot() {
    return {
      config,
      session,
      user,
      usage,
      activationRequired: isActivation(),
      recoveryRequired: isRecovery(),
      authError: authLinkError,
    };
  }

  function isActivation() {
    return new URLSearchParams(global.location.search).get("activation") === "1";
  }

  function isRecovery() {
    return new URLSearchParams(global.location.search).get("recovery") === "1";
  }

  function isPasswordSetup() {
    return isActivation() || isRecovery();
  }

  function isHostedAvailable() {
    return Boolean(config.ai.hostedAvailable);
  }

  function emitCapabilities() {
    callbacks.onCapabilities && callbacks.onCapabilities({
      authEnabled: Boolean(config.auth.enabled),
      hostedAvailable: Boolean(config.ai.hostedAvailable),
    });
  }

  function emitAuth() {
    callbacks.onAuth && callbacks.onAuth({
      user,
      session,
      activationRequired: Boolean(user && isActivation()),
      recoveryRequired: Boolean(user && isRecovery()),
      authEnabled: Boolean(config.auth.enabled),
      authError: authLinkError,
    });
  }

  function emitSync(status) {
    callbacks.onSyncStatus && callbacks.onSyncStatus(status);
  }

  function ensureClient() {
    if (!client) throw new Error("Cloud accounts are not configured on this deployment.");
  }

  function hasPlannerData(value) {
    return Boolean(
      value
      && ((Array.isArray(value.tasks) && value.tasks.length)
        || (Array.isArray(value.backlog) && value.backlog.length))
    );
  }

  function sameState(a, b) {
    if (!a || !b) return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function cloneState(value) {
    const source = value && typeof value === "object" ? value : EMPTY_STATE;
    return JSON.parse(JSON.stringify({
      tasks: Array.isArray(source.tasks) ? source.tasks : [],
      backlog: Array.isArray(source.backlog) ? source.backlog : [],
    }));
  }

  function safeSet(key, value) {
    try {
      global.localStorage.setItem(key, value);
    } catch (err) {
      // The app's in-memory fallback remains authoritative.
    }
  }

  function safeRemove(key) {
    try {
      global.localStorage.removeItem(key);
    } catch (err) {
      // Ignore storage restrictions.
    }
  }

  function safeGet(key) {
    try {
      return global.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function readJson(key) {
    try {
      const raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function readAuthLinkError() {
    const params = new URLSearchParams(String(global.location.hash || "").replace(/^#/, ""));
    const description = params.get("error_description");
    if (!description) return "";
    return /expired|invalid|already/i.test(description)
      ? authLinkExpiredMessage()
      : authLinkFailureMessage();
  }

  function readAuthLinkSession() {
    if (!isPasswordSetup()) return null;
    const params = new URLSearchParams(String(global.location.hash || "").replace(/^#/, ""));
    const type = params.get("type");
    if (type && ((isActivation() && type !== "invite") || (isRecovery() && type !== "recovery"))) {
      return null;
    }
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return null;
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  function adoptAuthLinkModeFromFragment() {
    const params = new URLSearchParams(String(global.location.hash || "").replace(/^#/, ""));
    const type = params.get("type");
    if (isPasswordSetup() || (type !== "invite" && type !== "recovery")) return;
    const url = new URL(global.location.href);
    url.searchParams.set(type === "invite" ? "activation" : "recovery", "1");
    global.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function authLinkExpiredMessage() {
    return isRecovery()
      ? "This password reset link is expired or has already been used."
      : "This activation link is expired or has already been used.";
  }

  function authLinkFailureMessage() {
    return isRecovery()
      ? "This password reset link could not be verified."
      : "This activation link could not be verified.";
  }

  function hasAuthLinkFragment() {
    const params = new URLSearchParams(String(global.location.hash || "").replace(/^#/, ""));
    return [
      "access_token",
      "refresh_token",
      "error",
      "error_description",
    ].some((name) => params.has(name));
  }

  function clearAuthFragment() {
    if (!global.location.hash) return;
    const url = new URL(global.location.href);
    global.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }

  global.OverrunCloud = {
    getAccessToken,
    getSnapshot,
    init,
    isHostedAvailable,
    refreshUsage,
    requestPasswordReset,
    resolveConflict,
    scheduleSave,
    setPassword,
    signIn,
    signOut,
    validatePassword,
  };
})(window);
