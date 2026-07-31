(function initOverrunCloud(global) {
  const EMPTY_STATE = { tasks: [], backlog: [] };
  const ACCOUNT_CACHE_PREFIX = "overrun_lite_state:";
  const ACCOUNT_REVISION_PREFIX = "overrun_lite_revision:";
  const PENDING_INVITE_KEY = "overrun_lite_pending_invite_url";
  const PASSWORD_SETUP_KEY = "overrun_lite_password_setup";
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
  let connectedUserId = null;
  let connectingUserId = null;
  let connectionPromise = null;
  let connectionVersion = 0;
  let usage = null;
  let conflict = null;
  let authLinkError = "";
  let inviteConfirmationRequired = false;
  let authRetryAvailable = false;
  let authLinkInFlight = false;
  let pendingInviteActionUrl = "";
  let passwordSetupContext = null;

  async function init(nextCallbacks = {}) {
    callbacks = nextCallbacks;
    adoptAuthLinkModeFromFragment();
    pendingInviteActionUrl = captureInviteConfirmationUrl();
    passwordSetupContext = readSessionJson(PASSWORD_SETUP_KEY);
    authLinkError = "";
    authRetryAvailable = false;
    config = await loadConfig();
    prepareInviteConfirmation();
    emitCapabilities();
    if (!config.auth.enabled || !global.supabase || !global.supabase.createClient) {
      if (isAuthFlowRequested() && !authLinkError) {
        authLinkError = "Account links are unavailable on this deployment.";
      }
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
      const previousUserId = user && user.id ? user.id : null;
      session = nextSession;
      user = nextSession && nextSession.user ? nextSession.user : null;
      const nextUserId = user && user.id ? user.id : null;
      emitAuth();
      if (event === "SIGNED_OUT") {
        clearPasswordSetupContext();
        resetAccountConnection();
        usage = null;
        callbacks.onUsage && callbacks.onUsage(null);
        callbacks.onGuest && callbacks.onGuest();
        emitSync("Local only");
      } else if (user && !isPasswordSetup()) {
        if (previousUserId && previousUserId !== nextUserId) {
          resetAccountConnection();
        }
        queueAccountConnection(user);
      }
    });
    global.addEventListener("online", () => {
      if (!user || syncPaused || isPasswordSetup() || !callbacks.getPlannerState) return;
      saveNow(callbacks.getPlannerState()).catch(() => emitSync("Offline"));
    });

    const authLinkCallback = readAuthLinkCallback();
    if (authLinkCallback.kind === "terminal") {
      markTerminalAuthLinkFailure();
    } else if (authLinkCallback.kind === "session") {
      await establishAuthLinkSession(authLinkCallback.credentials);
    }

    const { data } = await client.auth.getSession();
    session = data && data.session ? data.session : null;
    user = session && session.user ? session.user : null;
    if (
      isPasswordSetup()
      && !isVerifiedPasswordSetup()
      && !authRetryAvailable
      && authLinkCallback.kind === "none"
    ) {
      markTerminalAuthLinkFailure();
    }
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
    if (!isVerifiedPasswordSetup()) throw new Error(authLinkExpiredMessage());
    validatePassword(password);
    const { error } = await client.auth.updateUser({ password });
    if (error) throw new Error(error.message || "Could not set the password.");
    authLinkError = "";
    clearPasswordSetupContext();
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

  function queueAccountConnection(nextUser) {
    const expectedUserId = nextUser && nextUser.id;
    if (!expectedUserId) return;
    global.setTimeout(() => {
      if (!user || user.id !== expectedUserId || isPasswordSetup()) return;
      connectAccount(user).catch(() => emitSync("Offline"));
    }, 0);
  }

  function resetAccountConnection() {
    connectionVersion += 1;
    connectedUserId = null;
    connectingUserId = null;
    connectionPromise = null;
    revision = 0;
    syncPaused = false;
    conflict = null;
    clearTimeout(saveTimer);
    saveTimer = null;
    pendingState = null;
  }

  function isCurrentConnection(userId, version) {
    return Boolean(user && user.id === userId && connectionVersion === version);
  }

  function connectAccount(nextUser) {
    if (!nextUser || !nextUser.id) return Promise.resolve(false);
    if (connectedUserId === nextUser.id) return Promise.resolve(true);
    if (connectingUserId === nextUser.id && connectionPromise) return connectionPromise;

    const version = connectionVersion + 1;
    connectionVersion = version;
    connectingUserId = nextUser.id;
    const request = reconcileAccount(nextUser, version);
    connectionPromise = request;
    request.then(
      () => finishAccountConnection(request, nextUser.id),
      () => finishAccountConnection(request, nextUser.id)
    );
    return request;
  }

  function finishAccountConnection(request, userId) {
    if (connectionPromise !== request || connectingUserId !== userId) return;
    connectingUserId = null;
    connectionPromise = null;
  }

  async function reconcileAccount(nextUser, version) {
    emitSync("Loading");
    const localGuest = cloneState(
      callbacks.getPlannerState ? callbacks.getPlannerState() : EMPTY_STATE
    );
    const cacheKey = `${ACCOUNT_CACHE_PREFIX}${nextUser.id}`;
    const existingAccountCache = readJson(cacheKey);
    const returningAccount = isPlannerState(existingAccountCache);

    try {
      const { data, error } = await client
        .from("planner_states")
        .select("state, revision, updated_at")
        .eq("user_id", nextUser.id)
        .maybeSingle();
      if (error) throw error;
      if (!isCurrentConnection(nextUser.id, version)) return false;

      const cloudState = data ? cloneState(data.state) : null;
      revision = data ? Number(data.revision) || 0 : 0;
      const hasLocal = hasPlannerData(localGuest);
      const hasCloud = hasPlannerData(cloudState);
      let choice = "cloud";

      if (!returningAccount && hasLocal && !sameState(localGuest, cloudState)) {
        choice = callbacks.chooseInitialSync
          ? await callbacks.chooseInitialSync({
              localState: localGuest,
              cloudState: cloudState || cloneState(EMPTY_STATE),
              hasCloud,
            })
          : "cloud";
      }
      if (!isCurrentConnection(nextUser.id, version)) return false;

      if (choice === "local") {
        const saved = await saveNow(localGuest, { allowConflictPrompt: false });
        if (!saved) throw new Error("Could not move local data into the account.");
        if (!isCurrentConnection(nextUser.id, version)) return false;
        safeRemove("overrun_lite_state");
        activateAccount(nextUser.id, localGuest);
      } else {
        if (!returningAccount && hasLocal && !sameState(localGuest, cloudState)) {
          safeRemove("overrun_lite_state");
        }
        activateAccount(nextUser.id, cloudState || EMPTY_STATE);
      }
      connectedUserId = nextUser.id;
      safeSet(cacheKey, JSON.stringify(callbacks.getPlannerState()));
      safeSet(`${ACCOUNT_REVISION_PREFIX}${nextUser.id}`, String(revision));
      emitSync("Synced");
      await refreshUsage();
      return true;
    } catch (err) {
      if (!isCurrentConnection(nextUser.id, version)) return false;
      const cached = existingAccountCache || readJson(cacheKey);
      if (cached) {
        revision = Number(safeGet(`${ACCOUNT_REVISION_PREFIX}${nextUser.id}`)) || 0;
        activateAccount(nextUser.id, cached);
      } else {
        activateAccount(nextUser.id, EMPTY_STATE);
      }
      connectedUserId = nextUser.id;
      emitSync("Offline");
      return false;
    }
  }

  function activateAccount(userId, plannerState) {
    callbacks.onAccount && callbacks.onAccount(userId, cloneState(plannerState));
  }

  function scheduleSave(plannerState) {
    if (!user || !client || syncPaused || isPasswordSetup()) return;
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
    if (!user || !client || isPasswordSetup()) return false;
    const saveUserId = user.id;
    const localState = cloneState(plannerState);
    const { data, error } = await client.rpc("save_planner_state", {
      p_expected_revision: revision,
      p_state: localState,
    });
    if (!user || user.id !== saveUserId) return false;
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
    safeSet(`${ACCOUNT_CACHE_PREFIX}${saveUserId}`, JSON.stringify(localState));
    safeSet(`${ACCOUNT_REVISION_PREFIX}${saveUserId}`, String(revision));
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
    const activationRequired = Boolean(user && isActivation() && isVerifiedPasswordSetup());
    const recoveryRequired = Boolean(user && isRecovery() && isVerifiedPasswordSetup());
    return {
      config,
      session,
      user,
      usage,
      activationRequired,
      recoveryRequired,
      inviteConfirmationRequired,
      invitePending: isInviteConfirmation(),
      activationPending: Boolean(isActivation() && !activationRequired),
      recoveryPending: Boolean(isRecovery() && !recoveryRequired),
      authRetryAvailable,
      authLinkInFlight,
      authError: authLinkError,
    };
  }

  function isInviteConfirmation() {
    return new URLSearchParams(global.location.search).get("invite") === "1";
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

  function isAuthFlowRequested() {
    return isInviteConfirmation() || isPasswordSetup();
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
      ...getSnapshot(),
      authEnabled: Boolean(config.auth.enabled),
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

  function isPlannerState(value) {
    return Boolean(
      value
      && typeof value === "object"
      && Array.isArray(value.tasks)
      && Array.isArray(value.backlog)
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

  function readAuthLinkCallback() {
    if (!isPasswordSetup()) return { kind: "none" };
    const params = new URLSearchParams(String(global.location.hash || "").replace(/^#/, ""));
    const hasCallbackValues = [
      "access_token",
      "refresh_token",
      "error",
      "error_code",
      "error_description",
    ].some((name) => params.has(name));
    if (!hasCallbackValues) return { kind: "none" };
    if (params.has("error") || params.has("error_code") || params.has("error_description")) {
      return { kind: "terminal" };
    }
    const type = params.get("type");
    if (type && ((isActivation() && type !== "invite") || (isRecovery() && type !== "recovery"))) {
      return { kind: "terminal" };
    }
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return { kind: "terminal" };
    return {
      kind: "session",
      credentials: {
        access_token: accessToken,
        refresh_token: refreshToken,
      },
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
      ? "This password reset link is expired or has already been used. Request a new password reset email."
      : "This invitation is expired or has already been used. Ask the person who invited you for a new link.";
  }

  function authLinkFailureMessage() {
    return isRecovery()
      ? "We could not verify this password reset link. Check your connection and try again."
      : "We could not verify this invitation. Check your connection and try again.";
  }

  function clearAuthFragment() {
    if (!global.location.hash) return;
    const url = new URL(global.location.href);
    global.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }

  function captureInviteConfirmationUrl() {
    if (!isInviteConfirmation()) return readSessionValue(PENDING_INVITE_KEY);
    const params = new URLSearchParams(String(global.location.hash || "").replace(/^#/, ""));
    const actionUrl = params.get("confirmation_url") || "";
    if (global.location.hash) clearAuthFragment();
    if (actionUrl) writeSessionValue(PENDING_INVITE_KEY, actionUrl);
    return actionUrl || readSessionValue(PENDING_INVITE_KEY);
  }

  function prepareInviteConfirmation() {
    inviteConfirmationRequired = false;
    if (!isInviteConfirmation()) return;
    const contract = global.OverrunAuthLink;
    const validation = contract && contract.validateInviteActionUrl
      ? contract.validateInviteActionUrl(pendingInviteActionUrl, {
          supabaseUrl: config.auth.url,
          appOrigin: global.location.origin,
        })
      : false;
    if (config.auth.enabled && validation) {
      inviteConfirmationRequired = true;
      authLinkError = "";
      return;
    }
    pendingInviteActionUrl = "";
    removeSessionValue(PENDING_INVITE_KEY);
    authLinkError = "This invitation link is invalid. Ask the person who invited you for a new link.";
  }

  function acceptInvite() {
    if (!inviteConfirmationRequired || !pendingInviteActionUrl) {
      throw new Error("This invitation link is invalid. Ask for a new link.");
    }
    const validation = global.OverrunAuthLink.validateInviteActionUrl(pendingInviteActionUrl, {
      supabaseUrl: config.auth.url,
      appOrigin: global.location.origin,
    });
    if (!validation) {
      prepareInviteConfirmation();
      emitAuth();
      throw new Error("This invitation link is invalid. Ask for a new link.");
    }
    global.location.replace(pendingInviteActionUrl);
  }

  async function retryAuthLink() {
    ensureClient();
    const callback = readAuthLinkCallback();
    if (callback.kind !== "session") {
      markTerminalAuthLinkFailure();
      emitAuth();
      return false;
    }
    return establishAuthLinkSession(callback.credentials);
  }

  async function establishAuthLinkSession(credentials) {
    authLinkInFlight = true;
    authRetryAvailable = false;
    emitAuth();
    try {
      const { data, error } = await client.auth.setSession(credentials);
      if (error || !data || !data.session || !data.session.user) {
        if (isTerminalAuthLinkError(error)) {
          markTerminalAuthLinkFailure();
        } else {
          authLinkError = authLinkFailureMessage();
          authRetryAvailable = true;
        }
        return false;
      }
      session = data.session;
      user = data.session.user;
      passwordSetupContext = {
        mode: isRecovery() ? "recovery" : "activation",
        userId: user.id,
      };
      writeSessionValue(PASSWORD_SETUP_KEY, JSON.stringify(passwordSetupContext));
      authLinkError = "";
      authRetryAvailable = false;
      clearAuthFragment();
      pendingInviteActionUrl = "";
      removeSessionValue(PENDING_INVITE_KEY);
      return true;
    } catch (err) {
      if (isTerminalAuthLinkError(err)) {
        markTerminalAuthLinkFailure();
      } else {
        authLinkError = authLinkFailureMessage();
        authRetryAvailable = true;
      }
      return false;
    } finally {
      authLinkInFlight = false;
      emitAuth();
    }
  }

  function isTerminalAuthLinkError(error) {
    if (!error) return false;
    const status = Number(error.status || error.statusCode || 0);
    if (status >= 500) return false;
    if (status >= 400 && status < 500) return true;
    const value = `${error.code || ""} ${error.message || ""}`;
    return /otp_expired|refresh_token_not_found|token[^ ]* expired|already[ _-]?used/i.test(value);
  }

  function markTerminalAuthLinkFailure() {
    authLinkError = authLinkExpiredMessage();
    authRetryAvailable = false;
    authLinkInFlight = false;
    clearAuthFragment();
    pendingInviteActionUrl = "";
    removeSessionValue(PENDING_INVITE_KEY);
    clearPasswordSetupContext();
  }

  function isVerifiedPasswordSetup() {
    if (!user || !passwordSetupContext) return false;
    const expectedMode = isRecovery() ? "recovery" : isActivation() ? "activation" : "";
    return Boolean(
      expectedMode
      && passwordSetupContext.mode === expectedMode
      && passwordSetupContext.userId === user.id
    );
  }

  function clearPasswordSetupContext() {
    passwordSetupContext = null;
    removeSessionValue(PASSWORD_SETUP_KEY);
  }

  function readSessionJson(key) {
    try {
      const raw = global.sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function readSessionValue(key) {
    try {
      return global.sessionStorage.getItem(key) || "";
    } catch (err) {
      return "";
    }
  }

  function writeSessionValue(key, value) {
    try {
      global.sessionStorage.setItem(key, String(value));
    } catch (err) {
      // The current in-memory value remains available for this page load.
    }
  }

  function removeSessionValue(key) {
    try {
      global.sessionStorage.removeItem(key);
    } catch (err) {
      // Ignore storage restrictions.
    }
  }

  global.OverrunCloud = {
    acceptInvite,
    getAccessToken,
    getSnapshot,
    init,
    isHostedAvailable,
    refreshUsage,
    requestPasswordReset,
    retryAuthLink,
    resolveConflict,
    scheduleSave,
    setPassword,
    signIn,
    signOut,
    validatePassword,
  };
})(window);
