import { useState, type ReactNode } from "react";
import { t } from "@/i18n";
import { objectSupport } from "@/application/capability";
import { useConnection } from "@/app/connection-context";
import { useDiscoveryState } from "@/app/discovery-context";
import { PageHeader } from "@/components/common/layout";
import { NotConnected } from "@/components/common/NotConnected";
import { WorkflowTabs } from "@/components/common/WorkflowTabs";
import { Callout } from "@/components/ui/callout";
import { ChangePanel } from "./ChangePanel";
import { CreatePanel } from "./CreatePanel";
import { DeletePanel } from "./DeletePanel";
import { InfoPanel } from "./InfoPanel";
import { UserChangePanel } from "./UserChangePanel";
import { UserCreatePanel } from "./UserCreatePanel";
import { UserDeletePanel } from "./UserDeletePanel";
import { UserInfoPanel } from "./UserInfoPanel";

const ORGANISATION_WORKFLOWS = ["info", "create", "change", "delete"] as const;
const USER_WORKFLOWS = ["userInfo", "userCreate", "userChange", "userDelete"] as const;

type WorkflowId = (typeof ORGANISATION_WORKFLOWS)[number] | (typeof USER_WORKFLOWS)[number];

function workflowLabel(id: WorkflowId): string {
  switch (id) {
    case "info": return t("organisations.workflow.info");
    case "create": return t("organisations.workflow.create");
    case "change": return t("organisations.workflow.change");
    case "delete": return t("organisations.workflow.delete");
    case "userInfo": return t("organisations.workflow.userInfo");
    case "userCreate": return t("organisations.workflow.userCreate");
    case "userChange": return t("organisations.workflow.userChange");
    case "userDelete": return t("organisations.workflow.userDelete");
  }
}

function workflowDescription(id: WorkflowId): string {
  switch (id) {
    case "info": return t("organisations.workflowDescription.info");
    case "create": return t("organisations.workflowDescription.create");
    case "change": return t("organisations.workflowDescription.change");
    case "delete": return t("organisations.workflowDescription.delete");
    case "userInfo": return t("organisations.workflowDescription.userInfo");
    case "userCreate": return t("organisations.workflowDescription.userCreate");
    case "userChange": return t("organisations.workflowDescription.userChange");
    case "userDelete": return t("organisations.workflowDescription.userDelete");
  }
}

export function OrganisationsPage() {
  const discovery = useDiscoveryState();
  const { session } = useConnection();
  const support = objectSupport(discovery, "organisation");
  const usersOffered = objectSupport(discovery, "user") === "offered";
  const [workflow, setWorkflow] = useState<WorkflowId>("info");
  const [organisationId, setOrganisationId] = useState("");
  const [userId, setUserId] = useState("");

  const header = <PageHeader title={t("organisations.page.title")} description={t("organisations.page.description")} />;

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
        <Callout tone="info" title={t("organisations.connection.readingCapabilities")} />
      </>
    );
  }
  if (support !== "offered" || !session) {
    return (
      <>
        {header}
        <Callout tone="warning" title={discovery.status === "failed" ? t("organisations.connection.capabilitiesFailed") : support !== "offered" ? t("organisations.connection.notOffered") : t("organisations.connection.noConnection")}>
          {discovery.status === "failed"
            ? discovery.error.message
            : support !== "offered"
              ? t("organisations.connection.discoveryNotListed")
              : t("organisations.connection.setUpFirst")}
        </Callout>
      </>
    );
  }

  const panelProps = { organisationId, onOrganisationChange: setOrganisationId, userId, onUserChange: setUserId };
  const panels: Record<WorkflowId, ReactNode> = {
    info: <InfoPanel {...panelProps} />,
    create: <CreatePanel {...panelProps} />,
    change: <ChangePanel {...panelProps} />,
    delete: <DeletePanel {...panelProps} />,
    userInfo: <UserInfoPanel {...panelProps} />,
    userCreate: <UserCreatePanel {...panelProps} />,
    userChange: <UserChangePanel {...panelProps} />,
    userDelete: <UserDeletePanel {...panelProps} />,
  };
  const workflowIds: readonly WorkflowId[] = usersOffered ? [...ORGANISATION_WORKFLOWS, ...USER_WORKFLOWS] : ORGANISATION_WORKFLOWS;
  const workflows = workflowIds.map((id) => ({ id, label: workflowLabel(id) }));
  const descriptions: Record<WorkflowId, string> = {
    info: workflowDescription("info"), create: workflowDescription("create"), change: workflowDescription("change"), delete: workflowDescription("delete"),
    userInfo: workflowDescription("userInfo"), userCreate: workflowDescription("userCreate"), userChange: workflowDescription("userChange"), userDelete: workflowDescription("userDelete"),
  };

  return (
    <>
      {header}
      <WorkflowTabs
        label={t("organisations.workflowTabs.label")}
        workflows={workflows}
        descriptions={descriptions}
        panels={panels}
        selected={workflow}
        onSelect={setWorkflow}
      />
    </>
  );
}
