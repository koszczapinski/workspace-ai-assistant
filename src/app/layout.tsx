import type { Metadata } from "next";
import ThemeToggle from "@/components/theme-toggle";
import { BrandLogo } from "@/components/brand-logo";
import "./globals.css";

export const metadata: Metadata = {
  title: "NORTH | STAR · Workspace AI",
  description: "Private, workspace-scoped AI assistant demo",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="relative min-h-dvh bg-background font-sans text-foreground">
        {/* Global cinematic Earth / Terra background */}
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 select-none overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-bottom bg-no-repeat opacity-20 transition-opacity duration-500 dark:opacity-40"
            style={{ backgroundImage: "url('/terra-background.jpg')" }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/90" />
        </div>

        <div className="relative z-10 flex min-h-dvh flex-col">
          <header className="app-header">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
              <div className="flex min-w-0 items-center gap-3" aria-label="NORTH | STAR Workspace AI">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-md"
                >
                  <BrandLogo className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center text-sm font-semibold tracking-[0.2em]">
                    <span>NORTH</span>
                    <span className="mx-1 font-light text-sky-400/70">|</span>
                    <span>STAR</span>
                  </span>
                  <span className="mt-0.5 block text-[0.62rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">Workspace AI</span>
                </span>
              </div>
              <ThemeToggle />
            </div>
          </header>
          <div className="relative flex-1 min-h-[calc(100dvh-4rem)]">{children}</div>
        </div>
      </body>
    </html>
  );
}

