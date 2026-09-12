import type { Config } from "tailwindcss";

/**
 * SENTINEL design tokens.
 *
 * Single source of truth for the application's visual language. Pages must
 * reference these semantic tokens (e.g. `bg-sentinel-surface`) instead of
 * inventing raw values. Per-component hex values in TSX are a smell — add a
 * token here instead.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        // Brand scale (existing SENTINEL blue) — kept for legacy classes and
        // brand accents until the Phase 2+ visual system replaces them.
        sentinel: {
          50: "#f0f4ff",
          100: "#dbe4ff",
          200: "#bac8ff",
          300: "#91a7ff",
          400: "#748ffc",
          500: "#5c7cfa",
          600: "#4c6ef5",
          700: "#4263eb",
          800: "#3b5bdb",
          900: "#364fc7",
        },
        // Semantic surface/text tokens. Values intentionally match the
        // existing visual identity (light default + charcoal dark theme) so
        // Phase 1 changes styling architecture, not the product's look.
        "sentinel-bg": "var(--background)",
        "sentinel-surface": "var(--surface)",
        "sentinel-surface-alt": "var(--surface-alt)",
        "sentinel-border": "var(--border)",
        "sentinel-border-subtle": "var(--border-subtle)",
        "sentinel-text": "var(--text-primary)",
        "sentinel-text-secondary": "var(--text-secondary)",
        "sentinel-text-muted": "var(--text-muted)",
        "sentinel-accent": "var(--accent)",
        "sentinel-danger": "var(--danger)",
        "sentinel-warning": "var(--warning)",
        "sentinel-success": "var(--success)",
      },
    },
  },
  plugins: [],
};

export default config;
