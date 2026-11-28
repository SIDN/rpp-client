import { CircleUser, LogOut, Settings } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button-variants";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { useConnection } from "./connection-context";

const ITEM = "flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted";

/**
 * The account button of the top bar: a menu with who is logged in (the user name and organisation of the connection
 * profile), the client settings and logging out, which ends the connection and forgets the password.
 */
export function AccountMenu() {
  const { session, disconnect } = useConnection();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const auth = session?.profile.auth;

  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const onMenuKey = (event: KeyboardEvent) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const move = (index: number) => {
      event.preventDefault();
      list[(index + list.length) % list.length]?.focus();
    };
    if (event.key === "ArrowDown") move(at + 1);
    else if (event.key === "ArrowUp") move(at - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") setOpen(false);
  };

  let who: { title: string; detail?: string };
  if (!session) who = { title: t("app.account.notConnected") };
  else if (auth?.type === "basic")
    who = { title: auth.username, detail: auth.organisation ? t("app.account.organisation", { organisation: auth.organisation }) : t("app.account.noOrganisation") };
  else who = { title: t("app.account.anonymous"), detail: t("app.account.anonymousDetail") };

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-label={t("app.account.label")}
        title={t("app.account.label")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={buttonVariants({ variant: "ghost", size: "icon" })}
      >
        <CircleUser aria-hidden />
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={t("app.account.label")}
          onKeyDown={onMenuKey}
          className="absolute top-full right-0 z-30 mt-2 w-72 rounded-md border border-border bg-surface p-1 shadow-lg"
        >
          <div className="border-b border-border px-3 pt-2 pb-3" data-testid="account-identity">
            <p className="truncate font-medium" title={who.title}>
              {who.title}
            </p>
            {who.detail && <p className="mt-0.5 truncate text-sm text-muted-foreground">{who.detail}</p>}
          </div>
          <div className="pt-1">
            <Link to="/client" role="menuitem" tabIndex={-1} className={ITEM} onClick={() => close(false)}>
              <Settings aria-hidden className="size-4 text-muted-foreground" />
              {t("app.shell.clientSettings")}
            </Link>
            {session && (
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={cn(ITEM, "text-danger-ink")}
                onClick={() => {
                  close(false);
                  disconnect();
                  navigate("/connection");
                }}
              >
                <LogOut aria-hidden className="size-4" />
                {t("app.account.logOut")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
