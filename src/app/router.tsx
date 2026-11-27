import type { ReactElement } from "react";
import { createBrowserRouter, createMemoryRouter, type RouteObject } from "react-router-dom";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { CapabilitiesPage } from "@/features/capabilities/CapabilitiesPage";
import { DomainsPage } from "@/features/domains/DomainsPage";
import { ContactsPage } from "@/features/contacts/ContactsPage";
import { HostsPage } from "@/features/hosts/HostsPage";
import { OrganisationsPage } from "@/features/organisations/OrganisationsPage";
import { ProcessesPage } from "@/features/processes/ProcessesPage";
import { SearchPage } from "@/features/search/SearchPage";
import { ConnectionPage } from "@/features/connection/ConnectionPage";
import { ClientPage } from "@/features/client/ClientPage";
import { NotFoundPage, RouteError } from "@/features/errors/ErrorPages";
import { ExchangesPage } from "@/features/exchanges/ExchangesPage";
import { RawRequestPage } from "@/features/developer/RawRequestPage";
import { SchemasPage } from "@/features/schemas/SchemasPage";
import { MessagesPage } from "@/features/messages/MessagesPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { PlannedPage } from "@/features/planned/PlannedPage";
import { AppShell, type RouteHandle } from "./AppShell";
import { ALL_ITEMS } from "./navigation";

const handle = (titleKey: string): RouteHandle => ({ titleKey });

const screens: Record<string, ReactElement> = {
  "/connection": <ConnectionPage />,
  "/domains": <DomainsPage />,
  "/contacts": <ContactsPage />,
  "/hosts": <HostsPage />,
  "/organisations": <OrganisationsPage />,
  "/messages": <MessagesPage />,
  "/processes": <ProcessesPage />,
  "/search": <SearchPage />,
  "/developer/capabilities": <CapabilitiesPage />,
  "/developer/exchanges": <ExchangesPage />,
  "/developer/requests": <RawRequestPage />,
  "/developer/schemas": <SchemasPage />,
  "/developer/settings": <SettingsPage />,
};

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage />, handle: handle("nav.overview.label") },
      ...ALL_ITEMS.filter((item) => item.to !== "/").map(
        (item): RouteObject => ({
          path: item.to.slice(1),
          element: screens[item.to] ?? <PlannedPage item={item} />,
          handle: handle(item.labelKey),
        }),
      ),
      { path: "client", element: <ClientPage />, handle: handle("app.route.client") },
      { path: "*", element: <NotFoundPage />, handle: handle("app.route.notFound") },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);

export const createTestRouter = (initialEntries: string[]) => createMemoryRouter(routes, { initialEntries });
