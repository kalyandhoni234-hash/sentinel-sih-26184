"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { useHealth } from "@/hooks/useHealth";

/**
 * Application shell — persistent investigation-workstation chrome.
 *
 * Structure: left navigation rail (investigation-focused, intentionally
 * minimal) + a top bar carrying system status backed by the real /health
 * endpoint and the theme control. No fabricated telemetry: the status
 * indicator reflects only the actual /health result.
 */

const NAV_SECTIONS = [
  {
    label: "Investigate",
    items: [
      { href: "/investigations", label: "Cases", hint: "Investigation queue" },
      { href: "/investigations/new", label: "New Investigation", hint: "Run the analysis pipeline" },
    ],
  },
  {
    label: "System",
    items: [
      {
        href: "/system",
        label: "System",
        hint: "System health & model evaluation",
      },
    ],
  },
] as const;

function NavLink({
  href,
  label,
  active,
  collapsed,
  title,
}: {
  href: string;
  label: string;
  active: boolean;
  collapsed: boolean;
  title?: string;
}) {
  return (
    <Link
      href={href}
      title={title ?? label}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-sentinel-accent-dim text-sentinel-text"
          : "text-sentinel-text-secondary hover:bg-sentinel-surface-alt hover:text-sentinel-text"
      }`}
      style={active ? { background: "var(--accent-dim)" } : undefined}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "" : "opacity-40"}`}
        style={{ background: active ? "var(--accent)" : "currentColor" }}
      />
      <span className={collapsed ? "hidden" : "truncate"}>{label}</span>
    </Link>
  );
}

/** Small dot indicating real /health state — never a fabricated status. */
export function SystemStatusDot({ withLabel = true }: { withLabel?: boolean }) {
  const { health, error, status } = useHealth();
  const color =
    status === "operational"
      ? "var(--success)"
      : status === "offline"
        ? "var(--danger)"
        : "var(--text-muted)";
  const label =
    status === "operational"
      ? "System Operational"
      : status === "offline"
        ? "API Offline"
        : "Connecting…";

  return (
    <span
      className="flex items-center gap-1.5"
      title={health ? `API v${health.version}` : error ?? undefined}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {withLabel && (
        <span className="text-[10px] font-medium uppercase tracking-wider text-sentinel-text-muted">
          {label}
        </span>
      )}
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/health"
      ? pathname === "/health"
      : href === "/investigations"
        ? pathname === "/investigations" || /^\/investigations\/[^/]+$/.test(pathname)
        : pathname.startsWith(href);

  const rail = (
    <div
      className={`flex h-full flex-col border-r border-sentinel-border bg-sentinel-surface transition-all duration-200 ${
        collapsed ? "w-14" : "w-52"
      }`}
    >
      {/* Identity */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-sentinel-border px-3">
        <Link href="/" className="flex items-center gap-2 overflow-hidden">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] font-bold text-white"
            style={{ background: "var(--accent)" }}
          >
            S
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-col leading-none">
              <span className="text-xs font-bold tracking-wide text-sentinel-text">SENTINEL</span>
              <span className="mt-0.5 truncate text-[8px] font-medium uppercase tracking-[0.14em] text-sentinel-text-muted">
                Investigation Workstation
              </span>
            </span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV_SECTIONS.map((section, si) => (
          <div key={section.label} className={si > 0 ? "mt-4" : ""}>
            {!collapsed && (
              <p className="mb-1 px-2.5 text-[9px] font-bold uppercase tracking-[0.14em] text-sentinel-text-muted">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  title={collapsed ? item.label : item.hint}
                  active={isActive(item.href)}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: status + collapse */}
      <div className="shrink-0 border-t border-sentinel-border px-2 py-2.5">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <SystemStatusDot withLabel={false} />
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="rounded p-1 text-sentinel-text-muted hover:bg-sentinel-surface-alt"
              aria-label="Expand sidebar"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-1.5">
            <SystemStatusDot />
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="rounded p-1 text-sentinel-text-muted hover:bg-sentinel-surface-alt"
              aria-label="Collapse sidebar"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-screen shrink-0 md:block">{rail}</aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-0 h-full">{rail}</div>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-3 border-b border-sentinel-border bg-sentinel-surface px-3 sm:px-5">
          <button
            type="button"
            className="rounded p-1.5 text-sentinel-text-secondary hover:bg-sentinel-surface-alt md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Case context slot — the workspace layout mounts case identity here */}
          <div id="case-context-slot" className="min-w-0 flex-1" />

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden lg:block">
              <SystemStatusDot />
            </span>
            <span
              className="hidden rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sentinel-text-muted sm:block"
              style={{ borderColor: "var(--border)" }}
            >
              Synthetic Data
            </span>
            <ThemeToggle />
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
