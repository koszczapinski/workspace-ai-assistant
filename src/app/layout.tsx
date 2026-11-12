import type { Metadata } from "next";
import ThemeToggle from "@/components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "LUNARITY | Workspace AI",
  description: "Private, workspace-scoped AI assistant demo",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-dvh bg-background font-sans text-foreground">
        <div className="min-h-dvh bg-background text-foreground">
          <header className="app-header">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
              <div className="flex min-w-0 items-center gap-3" aria-label="LUNARITY Workspace AI">
                <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl border bg-card text-lg font-semibold tracking-tight shadow-sm">Λ</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold tracking-[0.18em]">LUNARITY</span>
                  <span className="mt-0.5 block text-[0.62rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">Workspace AI</span>
                </span>
              </div>
              <ThemeToggle />
            </div>
          </header>
          <div className="relative min-h-[calc(100dvh-4rem)]">{children}</div>
        </div>
      </body>
    </html>
  );
}
