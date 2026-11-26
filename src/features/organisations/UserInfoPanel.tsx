import { t } from "@/i18n";
import { useOperation } from "../shared/useOperation";
import { OperationOutcome } from "../shared/OperationOutcome";
import { SubmitButton } from "../shared/SubmitButton";
import { useLoadedUser, useOrganisationStore, useOrganisationWorkflows } from "./organisationHooks";
import { OrganisationField, UserField, type PanelProps } from "./parts";
import { UserDetails } from "./UserDetails";

export function UserInfoPanel({ organisationId, onOrganisationChange, userId, onUserChange }: PanelProps) {
  const workflows = useOrganisationWorkflows();
  const store = useOrganisationStore();
  const { setLoaded } = useLoadedUser();
  const info = useOperation(
    (variables: { organisationId: string; userId: string }, signal) => workflows.users.info(variables.organisationId, variables.userId, { signal }),
    (result, variables) => {
      if (!result.data) return;
      store.rememberUser(variables.organisationId, variables.userId, result.data);
      setLoaded(variables.organisationId, variables.userId);
    },
    { keep: "organisations/userInfo.info" },
  );

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          info.start({ organisationId, userId });
        }}
        className="flex max-w-xl flex-col gap-5"
      >
        <OrganisationField organisationId={organisationId} onOrganisationChange={onOrganisationChange} hint={t("organisations.userInfo.organisationHint")} />
        <UserField userId={userId} onUserChange={onUserChange} hint={t("organisations.userInfo.userHint")} />
        <div>
          <SubmitButton pending={info.pending}>{t("organisations.action.getInfo")}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={info} success={t("organisations.outcome.userFound", { user: info.variables?.userId.trim() || t("organisations.noun.user"), organisation: info.variables?.organisationId.trim() || t("organisations.noun.organisation") })}>
        {(user) => <UserDetails user={user} />}
      </OperationOutcome>
    </div>
  );
}
