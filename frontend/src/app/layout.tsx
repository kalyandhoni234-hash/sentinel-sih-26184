import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SENTINEL - Cybercrime Investigation Dashboard",
  description:
    "Investigator decision-support tool for cybercrime cash-out location ranking.",
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
                <h1 className="text-lg font-semibold text-gray-900">
                  SENTINEL
                </h1>
                <span className="badge-blue">MVP</span>
              </div>
              <nav className="flex items-center gap-4">
                <a
                  href="/investigations/new"
                  className="btn-primary hidden sm:inline-flex"
                >
                  New Investigation
                </a>
                <a
                  href="/investigations"
                  className="text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  Cases
                </a>
                <a
                  href="/health"
                  className="text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  Status
                </a>
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
