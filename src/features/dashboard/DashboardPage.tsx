import { useQuery, skipToken } from "@tanstack/react-query";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useConnection } from "@/app/connection-context";
import { useDiscoveryState } from "@/app/discovery-context";
import { useSettings } from "@/app/settings-context";
import {
  EXPIRY_WINDOW_DAYS,
  overviewList,
  overviewQuery,
  overviewTimeline,
  synthesizeOverview,
  type OverviewList,
  type OverviewPanel,
} from "@/application/dashboard/overview";
import { searchObjects } from "@/application/search/searchWorkflow";
import { NotConnected } from "@/components/common/NotConnected";
import { PageHeader, Section } from "@/components/common/layout";
import { FailureView } from "@/components/protocol/FailureView";
import { Callout } from "@/components/ui/callout";
import type { TimeDisplay } from "@/config/appSettings";
import { t } from "@/i18n";
import { formatDate } from "@/lib/dateTime";
import { cn } from "@/lib/utils";
import { toFailure, type RppFailure } from "@/rpp/errors/RppError";

type PanelState = { status: "loading" } | { status: "failed"; failure: RppFailure } | { status: "ready"; list: OverviewList };

interface Source {
  now: Date;
  synthetic: boolean;
  tld: string | undefined;
  seed: number;
}

/** A panel's page of domains: made up when the Overview is synthesized, else the answer to a QUERY of the server. */
function usePanel(panel: OverviewPanel, source: Source): PanelState {
  const { session } = useConnection();
  const { now, synthetic, tld, seed } = source;
  const query = useQuery({
    queryKey: ["overview", session?.id, panel, now.toISOString()] as const,
    queryFn:
      !synthetic && session
        ? async ({ signal }) => {
            const { data } = await searchObjects(session.client, "domainName", overviewQuery(panel, now), { signal });
            if (!data) throw new Error(t("dashboard.panel.emptyBody"));
            return data;
          }
        : skipToken,
  });
  const synthesized = useMemo(() => (synthetic ? overviewList(panel, synthesizeOverview(panel, now, { tld, seed }), now) : undefined), [synthetic, panel, now, tld, seed]);

  if (synthesized) return { status: "ready", list: synthesized };
  if (query.isError) return { status: "failed", failure: toFailure(query.error) };
  if (!query.data) return { status: "loading" };
  return { status: "ready", list: overviewList(panel, query.data, now) };
}

const domainLink = (name: string, tab: "renew" | "transfer" | "restore") => `/domains?${new URLSearchParams({ name, tab }).toString()}`;

const daysText = (days: number | undefined) => {
  if (days === undefined) return t("dashboard.days.unknown");
  if (days < 0) return t("dashboard.days.passed");
  if (days === 0) return t("dashboard.days.today");
  return days === 1 ? t("dashboard.days.one") : t("dashboard.days.many", { count: days });
};

/** How soon: within a week is urgent, within two weeks is near, later is calm. */
const urgency = (days: number | undefined) => (days === undefined ? "calm" : days < 7 ? "urgent" : days < 14 ? "near" : "calm");
const DOT = { urgent: "bg-danger", near: "bg-warning", calm: "bg-primary" } as const;

export function DashboardPage() {
  const { settings } = useSettings();
  const discovery = useDiscoveryState();
  const { session } = useConnection();
  const [now] = useState(() => new Date());
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 32));
  const snapshot = discovery.status === "ready" || discovery.status === "partial" ? discovery.snapshot : undefined;
  const source: Source = { now, synthetic: settings.synthesizeData, tld: snapshot?.tlds[0], seed };

  const header = <PageHeader title={t("nav.overview.label")} description={t("dashboard.description")} />;

  // Synthesized or not, the Overview is for a registrar who is connected to a server, as every object screen is.
  if (!session || discovery.status === "not-started") {
    return (
      <>
        {header}
        <NotConnected />
      </>
    );
  }
  if (discovery.status === "loading") {
    return (
      <>
        {header}
        <Callout tone="info" title={t("search.connection.readingCapabilities")} />
      </>
    );
  }
  if (discovery.status === "failed") {
    return (
      <>
        {header}
        <Callout tone="warning" title={t("search.connection.capabilitiesFailed")}>
          {discovery.error.message}
        </Callout>
      </>
    );
  }

  return (
    <>
      {header}
      {source.synthetic && (
        <Callout tone="warning" title={t("dashboard.synthetic.title")}>
          {t("dashboard.synthetic.description")}{" "}
          <Link to="/developer/settings" className="font-semibold underline underline-offset-2">
            {t("dashboard.synthetic.settings")}
          </Link>
        </Callout>
      )}
      <Expiring source={source} display={settings.timeDisplay} />
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
        <DueList panel="pendingTransfer" tab="transfer" source={source} display={settings.timeDisplay} />
        <DueList panel="redemption" tab="restore" source={source} display={settings.timeDisplay} />
      </div>
    </>
  );
}

function PanelBody({ state, empty, children }: { state: PanelState; empty: string; children: (list: OverviewList) => ReactNode }) {
  if (state.status === "loading") return <p className="text-sm text-muted-foreground">{t("dashboard.panel.loading")}</p>;
  if (state.status === "failed") return <FailureView failure={state.failure} />;
  if (state.list.entries.length === 0) return <p className="border-y border-border py-6 text-muted-foreground">{empty}</p>;
  return (
    <>
      {children(state.list)}
      {state.list.more && <p className="text-sm text-muted-foreground">{t("dashboard.panel.more")}</p>}
    </>
  );
}

function Expiring({ source, display }: { source: Source; display: TimeDisplay }) {
  const state = usePanel("expiring", source);
  const [active, setActive] = useState<string>();
  return (
    <Section id="expiring" title={t("dashboard.expiring.title", { days: EXPIRY_WINDOW_DAYS })} description={t("dashboard.expiring.description")}>
      <PanelBody state={state} empty={t("dashboard.expiring.empty", { days: EXPIRY_WINDOW_DAYS })}>
        {(list) => (
          <>
            <Timeline list={list} active={active} onActive={setActive} />
            <ol className="gap-x-12 border-t border-border lg:columns-2">
              {list.entries.map((entry) => (
                <li key={entry.name} className="break-inside-avoid border-b border-border" onMouseEnter={() => setActive(entry.name)} onMouseLeave={() => setActive(undefined)}>
                  <Link
                    to={domainLink(entry.name, "renew")}
                    onFocus={() => setActive(entry.name)}
                    onBlur={() => setActive(undefined)}
                    className={cn("grid grid-cols-[0.75rem_1fr_auto] items-baseline gap-x-3 px-2 py-2.5 hover:bg-muted/60 sm:grid-cols-[0.75rem_1fr_auto_6.5rem]", active === entry.name && "bg-muted/60")}
                  >
                    <span aria-hidden className={cn("size-2.5 self-center rounded-full", DOT[urgency(entry.daysLeft)])} />
                    <span className="truncate font-medium">{entry.name}</span>
                    <span className="hidden text-sm text-muted-foreground sm:block">{entry.date ? formatDate(entry.date, display) : ""}</span>
                    <span className="text-right text-sm tabular-nums">{daysText(entry.daysLeft)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </>
        )}
      </PanelBody>
    </Section>
  );
}

const TICKS = Array.from({ length: EXPIRY_WINDOW_DAYS + 1 }, (_, day) => day);

/**
 * The coming days as a ruler, today on the left, with a dot for each domain on the day it expires; domains of the same
 * day stack, up to a few, and the rest of a day is a count above the stack. When the server has more matches, the
 * days after the last one shown are hatched: unknown, not empty. It repeats the list below it, which is what assistive
 * technology reads.
 */
function Timeline({ list, active, onActive }: { list: OverviewList; active: string | undefined; onActive: (name: string | undefined) => void }) {
  const { days, knownUntil } = overviewTimeline(list);
  const highest = Math.max(1, ...days.map((day) => day.shown.length));
  const counted = days.some((day) => day.hidden.length > 0);
  const rows = Math.max(highest, 3) + (counted ? 1 : 0);
  const at = (day: number) => `${(day / EXPIRY_WINDOW_DAYS) * 100}%`;
  // Halfway into the next day, so that the dots of the last known day stay clear of the hatching.
  const unknownFrom = knownUntil === undefined ? undefined : Math.min(knownUntil + 0.5, EXPIRY_WINDOW_DAYS);

  return (
    <div aria-hidden className="select-none px-3 pt-2">
      <div className="relative" style={{ height: `${rows * 1.375 + 0.75}rem` }}>
        <div className="absolute inset-y-0 left-0 rounded-t-sm bg-danger-soft/80" style={{ width: at(7) }} />
        <div className="absolute inset-y-0 rounded-t-sm bg-warning-soft/60" style={{ left: at(7), width: at(7) }} />
        {unknownFrom !== undefined && (
          <div
            data-testid="timeline-unknown"
            className="absolute inset-y-0 right-0 overflow-hidden rounded-t-sm bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_6px,transparent_6px_12px)]"
            style={{ left: at(unknownFrom) }}
          >
            {EXPIRY_WINDOW_DAYS - unknownFrom >= 6 && (
              <span className="absolute top-1 right-2 rounded-sm bg-background/90 px-1.5 text-xs whitespace-nowrap text-muted-foreground">{t("dashboard.timeline.unknown")}</span>
            )}
          </div>
        )}
        {days.map(({ day, shown, hidden }) => (
          <Fragment key={day}>
            {shown.map((entry, index) => (
              <Link
                key={entry.name}
                to={domainLink(entry.name, "renew")}
                tabIndex={-1}
                title={`${entry.name}, ${daysText(entry.daysLeft)}`}
                onMouseEnter={() => onActive(entry.name)}
                onMouseLeave={() => onActive(undefined)}
                className={cn(
                  "absolute size-3 -translate-x-1/2 rounded-full ring-2 sm:size-4 ring-background transition-transform motion-reduce:transition-none",
                  DOT[urgency(entry.daysLeft)],
                  active === entry.name && "scale-150",
                )}
                style={{ left: at(day), bottom: `${index * 1.375 + 0.375}rem` }}
              />
            ))}
            {hidden.length > 0 && (
              <span
                data-testid="timeline-count"
                title={hidden.map((entry) => entry.name).join(", ")}
                className={cn(
                  "absolute -translate-x-1/2 rounded-sm px-0.5 text-xs leading-5 font-medium whitespace-nowrap tabular-nums text-muted-foreground",
                  hidden.some((entry) => entry.name === active) && "bg-foreground text-background",
                )}
                style={{ left: at(day), bottom: `${shown.length * 1.375 + 0.125}rem` }}
              >
                +{hidden.length}
              </span>
            )}
          </Fragment>
        ))}
      </div>
      <div className="relative h-7 border-t-2 border-foreground/70">
        {TICKS.map((day) => (
          <span
            key={day}
            className={cn("absolute top-0 w-px -translate-x-1/2 bg-foreground/50", day % 7 === 0 || day === EXPIRY_WINDOW_DAYS ? "h-2.5 bg-foreground/80" : "h-1.5")}
            style={{ left: at(day) }}
          />
        ))}
        {[0, 7, 14, 21, EXPIRY_WINDOW_DAYS].map((day) => (
          <span
            key={day}
            className={cn("absolute top-3 whitespace-nowrap text-xs text-muted-foreground", day === 0 ? "left-0" : day === EXPIRY_WINDOW_DAYS ? "right-0" : "-translate-x-1/2")}
            style={day === 0 || day === EXPIRY_WINDOW_DAYS ? undefined : { left: at(day) }}
          >
            {day === 0 ? t("dashboard.timeline.today") : t("dashboard.timeline.day", { count: day })}
          </span>
        ))}
      </div>
    </div>
  );
}

function DueList({ panel, tab, source, display }: { panel: "pendingTransfer" | "redemption"; tab: "transfer" | "restore"; source: Source; display: TimeDisplay }) {
  const state = usePanel(panel, source);
  return (
    <Section id={panel} title={t(`dashboard.${panel}.title`)} description={t(`dashboard.${panel}.description`)}>
      <PanelBody state={state} empty={t(`dashboard.${panel}.empty`)}>
        {(list) => (
          <ol className="divide-y divide-border border-y border-border">
            {list.entries.map((entry) => (
              <li key={entry.name}>
                <Link to={domainLink(entry.name, tab)} className="flex items-baseline justify-between gap-4 px-2 py-2.5 hover:bg-muted/60">
                  <span className="truncate font-medium">{entry.name}</span>
                  <span className="shrink-0 text-right text-sm" title={entry.date ? formatDate(entry.date, display) : undefined}>
                    {entry.daysLeft !== undefined && <span className="text-muted-foreground">{t(`dashboard.${panel}.due`)} </span>}
                    <span className="tabular-nums">{daysText(entry.daysLeft)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </PanelBody>
    </Section>
  );
}
