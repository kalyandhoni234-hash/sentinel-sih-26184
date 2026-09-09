import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "SENTINEL — Cybercrime Location Intelligence",
  description:
    "Evidence-based cybercrime investigation decision-support tool for cash-out location ranking.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('sentinel-theme');if(t==='oled')document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <ThemeProvider>
          <div className="min-h-screen" style={{ background: "var(--background)" }}>
            {/* ── Intelligence Console Header ── */}
            <header
              className="sticky top-0 z-50 border-b"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
                backdropFilter: "blur(12px)",
              }}
            >
              <div className="mx-auto flex h-12 max-w-[1600px] items-center justify-between px-4 sm:px-6">
                {/* Left: Identity */}
                <div className="flex items-center gap-3">
                  <Link href="/" className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sentinel-600 text-xs font-bold text-white tracking-tight">
                      S
                    </div>
                    <div className="flex flex-col leading-none">
                      <span className="text-sm font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                        SENTINEL
                      </span>
                      <span className="text-[9px] font-medium uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                        Evidence-Based Decision Support
                      </span>
                    </div>
                  </Link>
                  <span className="ml-2 hidden rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider sm:inline-block" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                    Synthetic Data
                  </span>
                </div>

                {/* Right: Nav + Controls */}
                <nav className="flex items-center gap-1">
                  <Link
                    href="/investigations"
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Cases
                  </Link>
                  <Link
                    href="/health"
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Status
                  </Link>
                  <div className="mx-1 h-4 w-px" style={{ background: "var(--border)" }} />
                  <ThemeToggle />
                  <Link
                    href="/investigations/new"
                    className="btn-primary ml-1 hidden text-xs sm:inline-flex"
                  >
                    + New
                  </Link>
                </nav>
              </div>
            </header>

            {/* ── Main Content ── */}
            <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
