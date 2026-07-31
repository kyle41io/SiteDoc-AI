"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { readStoredTheme, THEME_STORAGE_KEY } from "@/components/theme/theme-script";

export type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
  /** False until the inline script's choice has been read after mount. */
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/**
 * Owns the light/dark sheet. Light is the default; dark is opt-in through the
 * toggle and remembered in localStorage. The initial value is resolved before
 * paint by THEME_INIT_SCRIPT; this provider adopts whatever that script decided
 * (so server and first client render agree on "light") and then keeps
 * `data-theme` and localStorage in step with the toggle.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stamped = document.documentElement.dataset.theme;
    // Fall back to resolving the preference here when the pre-paint script did
    // not stamp anything — on a route-level not-found boundary it never runs,
    // and without this the page is pinned to the light sheet.
    const resolved = isTheme(stamped) ? stamped : readStoredTheme();
    if (!isTheme(stamped)) {
      document.documentElement.dataset.theme = resolved;
    }
    if (resolved !== "light") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time, hydration-safe adoption of the pre-paint choice
      setTheme(resolved);
    }
    setReady(true);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Private-mode / blocked storage: the choice just won't persist.
      }
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, toggleTheme, ready }),
    [theme, toggleTheme, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
