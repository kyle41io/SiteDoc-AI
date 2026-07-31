/** localStorage key holding the user's explicit light/dark choice. */
export const THEME_STORAGE_KEY = "sitedoc-theme";

/**
 * Runs synchronously in <head> before first paint. It resolves the saved
 * preference (falling back to the OS setting) and stamps `data-theme` on
 * <html>, so the stylesheet only ever needs the `[data-theme="dark"]`
 * override — no `prefers-color-scheme` duplicate to keep in sync, and no
 * flash of the wrong sheet on load.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
var t=(s==="light"||s==="dark")?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");
document.documentElement.dataset.theme=t;
}catch(e){document.documentElement.dataset.theme="light";}})();`;

/**
 * The same resolution the inline script performs, for the client to fall back on.
 *
 * The script above is only an optimization (it avoids a flash of the wrong
 * sheet); it is not guaranteed to run. On a route-level `not-found` boundary
 * React inserts the `<script>` during a client render, where scripts never
 * execute, so nothing stamps `data-theme` and the page would stay on the light
 * defaults forever. ThemeProvider calls this after mount to close that gap.
 */
export function readPreferredTheme(): "light" | "dark" {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      return saved;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}
