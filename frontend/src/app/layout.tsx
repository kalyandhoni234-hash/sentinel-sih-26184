import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

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
    <html lang="en">
      <body>
        <div className="min-h-screen bg-gray-50">
          <header className="border-b border-gray-200 bg-white">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-sentinel-600 text-sm font-bold text-white">
                  S
                </div>
                <div className="flex flex-col">
                  <h1 className="text-lg font-semibold text-gray-900 leading-tight">
                    SENTINEL
                  </h1>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400 hidden sm:block">
                    Cybercrime Location Intelligence
                  </span>
                </div>
              </div>
              <nav className="flex items-center gap-4">
                <Link
                  href="/investigations/new"
                  className="btn-primary hidden sm:inline-flex"
                >
                  New Investigation
                </Link>
                <Link
                  href="/investigations"
                  className="text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  Cases
                </Link>
                <Link
                  href="/health"
                  className="text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  Status
                </Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
