"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "oled";

const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
}>({ theme: "light", toggle: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sentinel-theme") as Theme | null;
    const initial = saved === "oled" ? "oled" : "light";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "oled");
    setMounted(true);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "oled" : "light";
      localStorage.setItem("sentinel-theme", next);
      document.documentElement.classList.toggle("dark", next === "oled");
      return next;
    });
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
