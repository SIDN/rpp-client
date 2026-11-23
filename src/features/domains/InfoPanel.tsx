import { useForm } from "react-hook-form";
import { Choice } from "@/components/ui/choice";
import { useDomainStore } from "./domainCache";
import { DomainDetails } from "./DomainDetails";
import { OperationOutcome } from "../shared/OperationOutcome";
import { NameField, type PanelProps } from "./parts";
import { useDomainWorkflows } from "./useDomainWorkflows";
import { SubmitButton } from "../shared/SubmitButton";
import { useOperation } from "../shared/useOperation";

export function InfoPanel({ name, onNameChange }: PanelProps) {
  const workflows = useDomainWorkflows();
  const store = useDomainStore();
  const { register, handleSubmit } = useForm({ defaultValues: { authInfo: false } });
  const info = useOperation(
    (variables: { name: string; authInfo: boolean }, signal) => workflows.info(variables.name, { authInfo: variables.authInfo, signal }),
    (result, variables) => {
      if (result.data) store.remember(variables.name, result.data);
    },
  );

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit((values) => info.start({ name, authInfo: values.authInfo }))} className="flex max-w-xl flex-col gap-5">
        <NameField name={name} onNameChange={onNameChange} />
        <Choice
          type="checkbox"
          label="Include the transfer password"
          hint="Only the sponsoring registrar is given it, and only if the registry can show it."
          {...register("authInfo")}
        />
        <div>
          <SubmitButton pending={info.pending}>Get info</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={info} success={`Found ${info.variables?.name ?? "the domain"}`}>
        {(domain) => <DomainDetails domain={domain} />}
      </OperationOutcome>
    </div>
  );
}
