import { t } from "@/i18n";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { objectSupport } from "@/application/capability";
import { useConnection } from "@/app/connection-context";
import { useDiscoveryState } from "@/app/discovery-context";
import { PageHeader } from "@/components/common/layout";
import { NotConnected } from "@/components/common/NotConnected";
import { WorkflowTabs } from "@/components/common/WorkflowTabs";
import { Callout } from "@/components/ui/callout";
import { ChangePanel } from "./ChangePanel";
import { CheckPanel } from "./CheckPanel";
import { DeletePanel } from "./DeletePanel";
import { InfoPanel } from "./InfoPanel";
import { RegisterPanel } from "./RegisterPanel";
import { RenewPanel } from "./RenewPanel";
import { RestorePanel } from "./RestorePanel";
import { TransferPanel } from "./TransferPanel";
import { useDraftState } from "../shared/drafts";

const WORKFLOWS = ["info", "check", "register", "change", "renew", "restore", "transfer", "delete"] as const;

type WorkflowId = (typeof WORKFLOWS)[number];


export function DomainsPage() {
  const discovery = useDiscoveryState();
  const { session } = useConnection();
  const support = objectSupport(discovery, "domainName");
  const [params] = useSearchParams();
  // Kept for the connection, so that the screen is as it was left; a link that names a tab or a name wins.
  const [workflow, setWorkflow] = useDraftState<WorkflowId>("domains/workflow", "info", WORKFLOWS.find((id) => id === params.get("tab")));
  const [name, setName] = useDraftState("domains/name", "", params.get("name") ?? undefined);

  const labels: Record<WorkflowId, string> = {
    info: t("domains.page.info"), check: t("domains.page.check"), register: t("domains.page.register"), change: t("domains.page.change"),
    renew: t("domains.page.renew"), restore: t("domains.page.restore"), transfer: t("domains.page.transfer"), delete: t("domains.page.delete"),
  };
  const descriptions: Record<WorkflowId, string> = {
    info: t("domains.page.infoDescription"), check: t("domains.page.checkDescription"), register: t("domains.page.registerDescription"),
    change: t("domains.page.changeDescription"), renew: t("domains.page.renewDescription"), restore: t("domains.page.restoreDescription"),
    transfer: t("domains.page.transferDescription"), delete: t("domains.page.deleteDescription"),
  };
  const workflows = WORKFLOWS.map((id) => ({ id, label: labels[id] }));
  const header = <PageHeader title={t("domains.page.title")} description={t("domains.page.description")} />;

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
        <Callout tone="info" title={t("domains.page.loadingCapabilities")} />
      </>
    );
  }
  if (support !== "offered") {
    return (
      <>
        {header}
        <Callout tone="warning" title={discovery.status === "failed" ? t("domains.page.capabilitiesFailed") : t("domains.page.domainNamesNotOffered")}>
          {discovery.status === "failed" ? discovery.error.message : t("domains.page.notOfferedDetail")}
        </Callout>
      </>
    );
  }

  const panelProps = { name, onNameChange: setName };
  const panels: Record<WorkflowId, ReactNode> = {
    info: <InfoPanel {...panelProps} />,
    check: <CheckPanel {...panelProps} onRegister={() => setWorkflow("register")} />,
    register: <RegisterPanel {...panelProps} />,
    change: <ChangePanel {...panelProps} />,
    renew: <RenewPanel {...panelProps} />,
    restore: <RestorePanel {...panelProps} />,
    transfer: <TransferPanel {...panelProps} />,
    delete: <DeletePanel {...panelProps} />,
  };

  return (
    <>
      {header}
      <WorkflowTabs label={t("domains.page.tabsLabel")} workflows={workflows} descriptions={descriptions} panels={panels} selected={workflow} onSelect={setWorkflow} />
    </>
  );
}
