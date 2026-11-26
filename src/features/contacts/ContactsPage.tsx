import { useState, type ReactNode } from "react";
import { useDraftState } from "../shared/drafts";
import { useSearchParams } from "react-router-dom";
import { objectSupport } from "@/application/capability";
import { useConnection } from "@/app/connection-context";
import { useDiscoveryState } from "@/app/discovery-context";
import { PageHeader } from "@/components/common/layout";
import { NotConnected } from "@/components/common/NotConnected";
import { WorkflowTabs } from "@/components/common/WorkflowTabs";
import { Callout } from "@/components/ui/callout";
import { t } from "@/i18n";
import { ChangePanel } from "./ChangePanel";
import { CheckPanel } from "./CheckPanel";
import { CreatePanel } from "./CreatePanel";
import { DeletePanel } from "./DeletePanel";
import { InfoPanel } from "./InfoPanel";
import { TransferPanel } from "./TransferPanel";

const WORKFLOW_IDS = ["info", "check", "create", "change", "transfer", "delete"] as const;
type WorkflowId = (typeof WORKFLOW_IDS)[number];

export function ContactsPage() {
  const discovery = useDiscoveryState();
  const { session } = useConnection();
  const support = objectSupport(discovery, "contact");
  const [params] = useSearchParams();
  // Kept for the connection, so that the screen is as it was left; a link that names a tab or an identifier wins.
  const [workflow, setWorkflow] = useDraftState<WorkflowId>("contacts/workflow", "info", WORKFLOW_IDS.find((id) => id === params.get("tab")));
  const [id, setId] = useDraftState("contacts/id", "", params.get("name") ?? undefined);
  const [lookUpAtOnce] = useState(() => params.get("run") === "1");

  const workflows = [
    { id: "info", label: t("contacts.tabs.info") },
    { id: "check", label: t("contacts.tabs.check") },
    { id: "create", label: t("contacts.tabs.create") },
    { id: "change", label: t("contacts.tabs.change") },
    { id: "transfer", label: t("contacts.tabs.transfer") },
    { id: "delete", label: t("contacts.tabs.delete") },
  ] as const;
  const descriptions: Record<WorkflowId, string> = {
    info: t("contacts.tabs.infoDescription"),
    check: t("contacts.tabs.checkDescription"),
    create: t("contacts.tabs.createDescription"),
    change: t("contacts.tabs.changeDescription"),
    transfer: t("contacts.tabs.transferDescription"),
    delete: t("contacts.tabs.deleteDescription"),
  };
  const header = <PageHeader title={t("contacts.page.title")} description={t("contacts.page.description")} />;

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
        <Callout tone="info" title={t("contacts.page.readingCapabilities")} />
      </>
    );
  }
  if (support !== "offered" || !session) {
    return (
      <>
        {header}
        <Callout tone="warning" title={discovery.status === "failed" ? t("contacts.page.capabilitiesFailed") : support !== "offered" ? t("contacts.page.notOffered") : t("contacts.page.noConnection")}>
          {discovery.status === "failed"
            ? discovery.error.message
            : support !== "offered"
              ? t("contacts.page.notOfferedDescription")
              : t("contacts.page.connectionRequired")}
        </Callout>
      </>
    );
  }

  const panelProps = { id, onIdChange: setId };
  const panels: Record<WorkflowId, ReactNode> = {
    info: <InfoPanel {...panelProps} startNow={lookUpAtOnce} />,
    check: <CheckPanel {...panelProps} onCreate={() => setWorkflow("create")} />,
    create: <CreatePanel {...panelProps} />,
    change: <ChangePanel {...panelProps} />,
    transfer: <TransferPanel {...panelProps} />,
    delete: <DeletePanel {...panelProps} />,
  };

  return (
    <>
      {header}
      <WorkflowTabs label={t("contacts.tabs.label")} workflows={workflows} descriptions={descriptions} panels={panels} selected={workflow} onSelect={setWorkflow} />
    </>
  );
}
