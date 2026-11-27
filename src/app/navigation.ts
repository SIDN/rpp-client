import {
  ArrowLeftRight,
  Braces,
  Building2,
  Cable,
  Globe,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Radar,
  Search,
  Server,
  Settings,
  Terminal,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ResourceType } from "@/rpp/core/types/resources";
import { env } from "@/config/env";

export const APP_TITLE: string = env.appTitle;

export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  /** The object type the server has to offer for this screen to work. */
  requires?: ResourceType;
  /** What the screen is for, shown while it is not built yet. */
  purposeKey: string;
}

export interface NavGroup {
  id: string;
  /** Undefined for the group that has no heading. */
  labelKey?: string;
  items: readonly NavItem[];
}

export const NAVIGATION: readonly NavGroup[] = [
  {
    id: "overview",
    items: [
      {
        to: "/",
        labelKey: "nav.overview.label",
        icon: LayoutDashboard,
        purposeKey: "nav.overview.purpose",
      },
    ],
  },
  {
    id: "registry",
    labelKey: "nav.group.registry",
    items: [
      { to: "/domains", labelKey: "nav.domainNames.label", icon: Globe, requires: "domainName", purposeKey: "nav.domainNames.purpose" },
      { to: "/contacts", labelKey: "nav.contacts.label", icon: UserRound, requires: "contact", purposeKey: "nav.contacts.purpose" },
      { to: "/hosts", labelKey: "nav.hosts.label", icon: Server, requires: "host", purposeKey: "nav.hosts.purpose" },
      { to: "/organisations", labelKey: "nav.organisations.label", icon: Building2, requires: "organisation", purposeKey: "nav.organisations.purpose" },
      { to: "/messages", labelKey: "nav.messages.label", icon: Inbox, requires: "message", purposeKey: "nav.messages.purpose" },
      { to: "/processes", labelKey: "nav.processes.label", icon: ListChecks, purposeKey: "nav.processes.purpose" },
      { to: "/search", labelKey: "nav.search.label", icon: Search, purposeKey: "nav.search.purpose" },
    ],
  },
  {
    id: "developer",
    labelKey: "nav.group.developer",
    items: [
      { to: "/developer/capabilities", labelKey: "nav.capabilities.label", icon: Radar, purposeKey: "nav.capabilities.purpose" },
      { to: "/developer/exchanges", labelKey: "nav.exchanges.label", icon: ArrowLeftRight, purposeKey: "nav.exchanges.purpose" },
      { to: "/developer/requests", labelKey: "nav.rawRequest.label", icon: Terminal, purposeKey: "nav.rawRequest.purpose" },
      { to: "/developer/schemas", labelKey: "nav.schemas.label", icon: Braces, purposeKey: "nav.schemas.purpose" },
      { to: "/developer/settings", labelKey: "nav.settings.label", icon: Settings, purposeKey: "nav.settings.purpose" },
    ],
  },
];

export const CONNECTION_ITEM: NavItem = {
  to: "/connection",
  labelKey: "nav.connection.label",
  icon: Cable,
  purposeKey: "nav.connection.purpose",
};

export const ALL_ITEMS: readonly NavItem[] = [...NAVIGATION.flatMap((group) => group.items), CONNECTION_ITEM];
