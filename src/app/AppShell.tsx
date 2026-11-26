import { CircleUser, Menu } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, Outlet, useLocation, useMatches } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { useSidebarCollapsed } from "@/lib/sidebar";
import { ConnectionStatus } from "./ConnectionStatus";
import { ErrorConsole } from "./ErrorConsole";
import { MessageCounter } from "./MessageCounter";
import { APP_TITLE } from "./navigation";
import { Sidebar } from "./Sidebar";

const NAVIGATION_ID = "primary-navigation";

/** The title a route declares in its `handle`. */
export interface RouteHandle {
  titleKey?: string;
}

function useRouteTitle(): void {
  const title = useMatches()
    .map((match) => (match.handle as RouteHandle | undefined)?.titleKey)
    .filter(Boolean)
    .at(-1);
  useEffect(() => {
    document.title = title ? `${t(title)} - ${APP_TITLE}` : APP_TITLE;
  }, [title]);
}

export function AppShell() {
  // The drawer is open for one location: navigating closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const { pathname } = useLocation();
  const open = openAt === pathname;
  const setOpen = (value: boolean) => setOpenAt(value ? pathname : null);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const menuButton = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);
  useRouteTitle();

  // A new screen starts at its content; the first render keeps the browser's own focus.
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenAt(null);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", close);
    document.getElementById(NAVIGATION_ID)?.querySelector("a")?.focus();
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  return (
    <div
      style={{ "--sidebar-width": collapsed ? "4rem" : "18rem" } as CSSProperties}
      className="min-h-dvh lg:grid lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)] lg:transition-[grid-template-columns] lg:duration-200"
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t("app.shell.skipToContent")}
      </a>

      {open && <div aria-hidden className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />}
      <Sidebar
        id={NAVIGATION_ID}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        className={cn(
          "fixed inset-y-0 left-0 z-40 transition-[transform,visibility] duration-200",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
          "lg:visible lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
        )}
      />

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:px-8">
          <Button
            ref={menuButton}
            variant="ghost"
            size="icon"
            className="-ml-2 lg:hidden"
            aria-label={t("app.shell.menu")}
            aria-expanded={open}
            aria-controls={NAVIGATION_ID}
            onClick={() => setOpen(!open)}
          >
            <Menu />
          </Button>
          <div aria-live="polite" className="min-w-0">
            <ConnectionStatus />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <MessageCounter />
            <ThemeToggle />
            <Link
              to="/client"
              aria-label={t("app.shell.clientSettings")}
              title={t("app.shell.clientSettings")}
              className={buttonVariants({ variant: "ghost", size: "icon" })}
            >
              <CircleUser aria-hidden />
            </Link>
          </div>
        </header>

        <main id="main" ref={main} tabIndex={-1} className="flex-1 px-4 py-8 pb-20 outline-none sm:px-8 lg:py-10 lg:pb-20">
          <div className="mx-auto flex max-w-5xl flex-col gap-10">
            <Outlet />
          </div>
        </main>
      </div>
      <ErrorConsole />
    </div>
  );
}
