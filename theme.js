(function applyInitialTheme() {
  const themeKey = "overrun_lite_theme";
  let savedTheme = null;

  try {
    savedTheme = localStorage.getItem(themeKey);
  } catch (err) {
    savedTheme = null;
  }

  const prefersDark = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = savedTheme === "light" || savedTheme === "dark"
    ? savedTheme
    : prefersDark
      ? "dark"
      : "light";

  document.documentElement.dataset.theme = theme;
})();
