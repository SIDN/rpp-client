import { NavLink } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { objectSupport } from "@/application/capability";
import { APP_TITLE, CONNECTION_ITEM, NAVIGATION, type NavItem } from "@/app/navigation";
import { useDiscoveryState } from "@/app/discovery-context";
import { CapabilityMark } from "@/components/protocol/capability-mark";
import { Logo } from "@/components/common/Logo";
import { cn } from "@/lib/utils";

/** Collapsing only applies on a wide screen: the drawer of a narrow one always shows the labels. */
function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const discovery = useDiscoveryState();
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          "relative flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-active focus-visible:outline-accent",
          collapsed && "lg:justify-center lg:px-0",
          isActive && "bg-sidebar-active text-white shadow-[inset_3px_0_0_var(--accent)]",
        )
      }
    >
      <Icon aria-hidden className={cn("size-4 shrink-0", collapsed && "lg:size-5")} />
      <span className={cn("flex-1 truncate", collapsed && "lg:sr-only")}>{item.label}</span>
      {item.requires && (
        <CapabilityMark support={objectSupport(discovery, item.requires)} className={cn("text-sidebar-muted", collapsed && "lg:absolute lg:top-1 lg:right-1.5")} />
      )}
    </NavLink>
  );
}

export function Sidebar({ id, className, collapsed, onToggleCollapsed }: { id: string; className?: string; collapsed: boolean; onToggleCollapsed: () => void }) {
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <aside id={id} className={cn("flex w-72 flex-col gap-6 bg-sidebar px-4 py-5 text-sidebar-foreground lg:w-[var(--sidebar-width)]", collapsed && "lg:px-2", className)}>
      <div className={cn("flex items-center gap-3 px-1", collapsed && "lg:justify-center lg:px-0")}>
        <Logo className="size-9 text-sidebar-foreground" />
        <span className={cn("text-base font-semibold tracking-tight text-white", collapsed && "lg:sr-only")}>{APP_TITLE}</span>
      </div>

      <nav aria-label="Primary" className="flex flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden">
        {NAVIGATION.map((group, index) => (
          <div
            key={group.id}
            role="group"
            aria-label={group.label}
            className={cn("flex flex-col gap-0.5", collapsed && index > 0 && "lg:border-t lg:border-sidebar-border lg:pt-3")}
          >
            {group.label && (
              <p aria-hidden className={cn("px-3 pb-1 text-sm font-medium text-sidebar-muted", collapsed && "lg:hidden")}>
                {group.label}
              </p>
            )}
            {group.items.map((item) => (
              <SidebarLink key={item.to} item={item} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-sidebar-border pt-4">
        <nav aria-label="Server">
          <SidebarLink item={CONNECTION_ITEM} collapsed={collapsed} />
        </nav>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={id}
          aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          title={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          onClick={onToggleCollapsed}
          className={cn(
            "hidden h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-active hover:text-sidebar-foreground focus-visible:outline-accent lg:flex",
            collapsed && "lg:justify-center lg:px-0",
          )}
        >
          <Toggle aria-hidden className={cn("size-4 shrink-0", collapsed && "lg:size-5")} />
          <span className={cn("flex-1 truncate text-left", collapsed && "lg:sr-only")}>Collapse</span>
        </button>
      </div>
    </aside>
  );
}
