(function (root, factory) {
  const contract = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = contract;
  }
  root.OverrunAuthLink = contract;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function buildActivationRedirectUrl(appOrigin) {
    const redirect = normalizeAppRoot(appOrigin);
    redirect.searchParams.set("activation", "1");
    return redirect.toString();
  }

  function buildInviteWrapperUrl(appOrigin, actionLink) {
    const wrapper = normalizeAppRoot(appOrigin);
    wrapper.searchParams.set("invite", "1");
    wrapper.hash = `confirmation_url=${encodeURIComponent(String(actionLink || ""))}`;
    return wrapper.toString();
  }

  function readInviteConfirmationUrl(locationHref) {
    const wrapper = new URL(locationHref);
    if (wrapper.searchParams.get("invite") !== "1") return "";
    const fragment = new URLSearchParams(wrapper.hash.replace(/^#/, ""));
    return String(fragment.get("confirmation_url") || "").trim();
  }

  function validateInviteActionUrl(actionLink, options = {}) {
    try {
      const action = new URL(String(actionLink || ""));
      const supabase = new URL(String(options.supabaseUrl || ""));
      const expectedRedirect = new URL(buildActivationRedirectUrl(options.appOrigin));
      const actualRedirect = new URL(String(action.searchParams.get("redirect_to") || ""));
      const actionPath = action.pathname.replace(/\/+$/, "");

      if (action.origin !== supabase.origin) return false;
      if (action.username || action.password) return false;
      if (actionPath !== "/auth/v1/verify") return false;
      if (action.searchParams.get("type") !== "invite") return false;
      if (!String(action.searchParams.get("token") || "").trim()) return false;
      if (actualRedirect.origin !== expectedRedirect.origin) return false;
      if (normalizePath(actualRedirect.pathname) !== normalizePath(expectedRedirect.pathname)) return false;
      if (actualRedirect.searchParams.get("activation") !== "1") return false;
      if ([...actualRedirect.searchParams.keys()].some((name) => name !== "activation")) return false;
      return !actualRedirect.hash;
    } catch (err) {
      return false;
    }
  }

  function normalizeAppRoot(value) {
    const url = new URL(String(value || ""));
    url.hash = "";
    url.search = "";
    url.pathname = "/";
    return url;
  }

  function normalizePath(value) {
    const path = String(value || "/").replace(/\/+$/, "");
    return path || "/";
  }

  return {
    buildActivationRedirectUrl,
    buildInviteWrapperUrl,
    readInviteConfirmationUrl,
    validateInviteActionUrl,
  };
});
