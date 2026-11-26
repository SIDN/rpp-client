import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useConnection } from "@/app/connection-context";
import { useDiscoveryState } from "@/app/discovery-context";
import { PageHeader } from "@/components/common/layout";
import { NotConnected } from "@/components/common/NotConnected";
import { WorkflowTabs } from "@/components/common/WorkflowTabs";
import { Callout } from "@/components/ui/callout";
import { t } from "@/i18n";
import { supportsObject } from "@/rpp/discovery/capabilities";
import type { ExtensionActivation } from "@/rpp/extensions/ExtensionRegistry";
import { DENIC_RRI } from "@/rpp/extensions/modules/denicRri";
import { useExtensionActivation } from "../useExtension";
import { ExtensionBadge } from "./ExtensionBadge";
import { ChangePanel, CheckPanel, CreatePanel, InfoPanel } from "./RequestContactPanels";

const WORKFLOW_IDS = ["info", "check", "create", "change"] as const;
type WorkflowId = (typeof WORKFLOW_IDS)[number];

/** Why the screen cannot be used although discovery was read. */
function unavailableReason(activation: ExtensionActivation): string {
  switch (activation.status) {
    case "not-advertised":
      return t("requestContacts.page.notAdvertised");
    case "version-mismatch":
      return t("requestContacts.page.versionMismatch", {
        advertised: activation.advertised.map((extension) => extension.version).join(", "),
        supported: activation.supportedVersions.join(", "),
      });
    case "not-in-preset":
      return activation.preset
        ? t("requestContacts.page.notInPreset", { preset: `${activation.preset.id} ${activation.preset.version}` })
        : t("requestContacts.page.noPreset");
    case "active":
      return t("requestContacts.page.objectNotListed");
  }
}

/** The request contacts of the DENIC RRI extension: shown only while the server confirms the extension. */
export function RequestContactsPage() {
  const discovery = useDiscoveryState();
  const { session } = useConnection();
  const activation = useExtensionActivation(DENIC_RRI);
  const [params] = useSearchParams();
  const [workflow, setWorkflow] = useState<WorkflowId>(() => WORKFLOW_IDS.find((id) => id === params.get("tab")) ?? "info");
  const [id, setId] = useState(() => params.get("name") ?? "");
  const [lookUpAtOnce] = useState(() => params.get("run") === "1");

  const header = (
    <PageHeader
      title={t("requestContacts.page.title")}
      description={t("requestContacts.page.description")}
      actions={<ExtensionBadge module={DENIC_RRI} />}
    />
  );

  if (discovery.status === "not-started") {
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
        <Callout tone="info" title={t("requestContacts.page.readingCapabilities")} />
      </>
    );
  }
  if (discovery.status === "failed") {
    return (
      <>
        {header}
        <Callout tone="warning" title={t("requestContacts.page.capabilitiesFailed")}>
          {discovery.error.message}
        </Callout>
      </>
    );
  }
  const usable = activation?.status === "active" && supportsObject(discovery.snapshot, "requestContact");
  if (!usable || !session) {
    return (
      <>
        {header}
        <Callout tone="warning" title={!session ? t("requestContacts.page.noConnection") : t("requestContacts.page.notOffered")}>
          {!session ? t("requestContacts.errors.connectionRequired") : activation && unavailableReason(activation)}
        </Callout>
      </>
    );
  }

  const workflows = [
    { id: "info", label: t("requestContacts.tabs.info") },
    { id: "check", label: t("requestContacts.tabs.check") },
    { id: "create", label: t("requestContacts.tabs.create") },
    { id: "change", label: t("requestContacts.tabs.change") },
  ] as const;
  const descriptions: Record<WorkflowId, string> = {
    info: t("requestContacts.tabs.infoDescription"),
    check: t("requestContacts.tabs.checkDescription"),
    create: t("requestContacts.tabs.createDescription"),
    change: t("requestContacts.tabs.changeDescription"),
  };
  const panelProps = { id, onIdChange: setId };
  const panels: Record<WorkflowId, ReactNode> = {
    info: <InfoPanel {...panelProps} startNow={lookUpAtOnce} />,
    check: <CheckPanel {...panelProps} onCreate={() => setWorkflow("create")} />,
    create: <CreatePanel {...panelProps} />,
    change: <ChangePanel {...panelProps} />,
  };

  return (
    <>
      {header}
      <WorkflowTabs label={t("requestContacts.tabs.label")} workflows={workflows} descriptions={descriptions} panels={panels} selected={workflow} onSelect={setWorkflow} />
      <p className="mt-6 max-w-[70ch] text-sm text-muted-foreground">{t("requestContacts.page.noDelete")}</p>
    </>
  );
}
