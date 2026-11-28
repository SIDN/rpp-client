import { useState, type ReactNode } from "react";
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
import { CreatePanel, type CreateClone } from "./CreatePanel";
import { DeletePanel } from "./DeletePanel";
import { InfoPanel } from "./InfoPanel";

const WORKFLOW_IDS = ["info", "check", "create", "change", "delete"] as const;
type WorkflowId = (typeof WORKFLOW_IDS)[number];

export function HostsPage() {
  const discovery = useDiscoveryState();
  const { session } = useConnection();
  const support = objectSupport(discovery, "host");
  const [params] = useSearchParams();
  const [workflow, setWorkflow] = useState<WorkflowId>(() => WORKFLOW_IDS.find((id) => id === params.get("tab")) ?? "info");
  const [name, setName] = useState(() => params.get("name") ?? "");
  const [clone, setClone] = useState<CreateClone>();
  const [lookUpAtOnce] = useState(() => params.get("run") === "1");

  const workflows = [
    { id: "info", label: t("hosts.tabs.info") },
    { id: "check", label: t("hosts.tabs.check") },
    { id: "create", label: t("hosts.tabs.create") },
    { id: "change", label: t("hosts.tabs.change") },
    { id: "delete", label: t("hosts.tabs.delete") },
  ] as const;
  const descriptions: Record<WorkflowId, string> = {
    info: t("hosts.tabs.infoDescription"),
    check: t("hosts.tabs.checkDescription"),
    create: t("hosts.tabs.createDescription"),
    change: t("hosts.tabs.changeDescription"),
    delete: t("hosts.tabs.deleteDescription"),
  };
  const header = <PageHeader title={t("hosts.page.title")} description={t("hosts.page.description")} />;

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
        <Callout tone="info" title={t("hosts.page.readingCapabilities")} />
      </>
    );
  }
  if (support !== "offered" || !session) {
    return (
      <>
        {header}
        <Callout tone="warning" title={discovery.status === "failed" ? t("hosts.page.capabilitiesFailed") : support !== "offered" ? t("hosts.page.notOffered") : t("hosts.page.noConnection")}>
          {discovery.status === "failed"
            ? discovery.error.message
            : support !== "offered"
              ? t("hosts.page.notOfferedDescription")
              : t("hosts.page.connectionRequired")}
        </Callout>
      </>
    );
  }

  const panelProps = { name, onNameChange: setName };
  const panels: Record<WorkflowId, ReactNode> = {
    info: (
      <InfoPanel
        {...panelProps}
        startNow={lookUpAtOnce}
        onClone={(host, values) => {
          setClone((current) => ({ serial: (current?.serial ?? 0) + 1, from: host.hostName, values }));
          setName("");
          setWorkflow("create");
        }}
      />
    ),
    check: <CheckPanel {...panelProps} onCreate={() => setWorkflow("create")} />,
    create: <CreatePanel {...panelProps} clone={clone} />,
    change: <ChangePanel {...panelProps} />,
    delete: <DeletePanel {...panelProps} />,
  };

  return (
    <>
      {header}
      <WorkflowTabs label={t("hosts.tabs.label")} workflows={workflows} descriptions={descriptions} panels={panels} selected={workflow} onSelect={setWorkflow} />
    </>
  );
}
