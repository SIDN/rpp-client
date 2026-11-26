import { useEffect, useMemo, useRef } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import type { ObjectUpdate } from "@/application/updates/objectUpdate";
import type { PatchOperation } from "@/rpp/operations/patch";
import { UpdateModeSection } from "@/features/shared/UpdateModeSection";
import { useObjectUpdate } from "@/features/shared/useObjectUpdate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";
import { t } from "@/i18n";
import { REQUEST_CONTACT_RESOURCE, type RequestContact } from "@/rpp/extensions/modules/denicRri";
import { OperationOutcome } from "@/features/shared/OperationOutcome";
import { SubmitButton } from "@/features/shared/SubmitButton";
import { useOperation, type Operation } from "@/features/shared/useOperation";
import { RequestContactDetails } from "./RequestContactDetails";
import { useCachedRequestContact, useRequestContactStore, useRequestContactWorkflows } from "./requestContactHooks";
import { UriTemplateField, type UriTemplateValues } from "./UriTemplateField";

/** What every panel receives: the handle being worked on, which the panels share. */
export interface PanelProps {
  id: string;
  onIdChange(id: string): void;
}

export function HandleField({ id, onIdChange }: PanelProps) {
  return (
    <Field label={t("requestContacts.form.handle")} hint={t("requestContacts.form.handleHint")}>
      {(control) => (
        <Input
          {...control}
          value={id}
          onChange={(event) => onIdChange(event.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="max-w-96 font-mono"
        />
      )}
    </Field>
  );
}

/** `startNow` reads the request contact as soon as the panel is shown, as when a link leads here. */
export function InfoPanel({ id, onIdChange, startNow = false }: PanelProps & { startNow?: boolean }) {
  const workflows = useRequestContactWorkflows();
  const store = useRequestContactStore();
  const info = useOperation(
    (variables: string, signal) => workflows.info(variables, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables, result.data);
    },
  );

  const started = useRef(false);
  const { start } = info;
  useEffect(() => {
    if (!startNow || started.current || id.trim() === "") return;
    started.current = true;
    start(id);
  }, [startNow, id, start]);

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          info.start(id);
        }}
        className="flex max-w-xl flex-col gap-5"
      >
        <HandleField id={id} onIdChange={onIdChange} />
        <div>
          <SubmitButton pending={info.pending}>{t("requestContacts.info.submit")}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={info} success={t("requestContacts.info.success", { id: info.variables?.trim() ?? "" })}>
        {(contact) => <RequestContactDetails contact={contact} />}
      </OperationOutcome>
    </div>
  );
}

export function CheckPanel({ id, onIdChange, onCreate }: PanelProps & { onCreate(): void }) {
  const workflows = useRequestContactWorkflows();
  const check = useOperation(async (variables: string, signal) => {
    const { available, details, meta } = await workflows.check(variables, { signal });
    return { data: { available, reason: details?.reason }, meta };
  });

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          check.start(id);
        }}
        className="flex max-w-xl flex-col gap-5"
      >
        <HandleField id={id} onIdChange={onIdChange} />
        <p className="text-sm text-muted-foreground">{t("requestContacts.check.sharedNamespace")}</p>
        <div>
          <SubmitButton pending={check.pending}>{t("requestContacts.check.submit")}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={check} success={t("requestContacts.check.success")}>
        {({ available, reason }) => (
          <div className="flex flex-col items-start gap-3">
            <p className="flex flex-wrap items-center gap-3 text-lg">
              <code>{check.variables?.trim()}</code>
              <Badge tone={available ? "success" : "danger"} dot>
                {available ? t("requestContacts.check.available") : t("requestContacts.check.notAvailable")}
              </Badge>
            </p>
            {reason && <p className="max-w-[62ch]">{reason}</p>}
            {available && (
              <Button variant="secondary" onClick={onCreate}>
                {t("requestContacts.check.createThis")}
              </Button>
            )}
          </div>
        )}
      </OperationOutcome>
    </div>
  );
}

export function CreatePanel({ id, onIdChange }: PanelProps) {
  const workflows = useRequestContactWorkflows();
  const store = useRequestContactStore();
  const form = useForm<UriTemplateValues>({ defaultValues: { uriTemplate: "" } });
  const create = useOperation(
    (variables: { id: string; uriTemplate: string }, signal) => workflows.create(variables, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables.id, result.data);
    },
  );

  return (
    <div className="flex flex-col gap-6">
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit((values) => create.start({ id, uriTemplate: values.uriTemplate }))} noValidate className="flex max-w-xl flex-col gap-6">
          <HandleField id={id} onIdChange={onIdChange} />
          <UriTemplateField />
          <p className="text-sm text-muted-foreground">{t("requestContacts.create.privacy")}</p>
          <div>
            <SubmitButton pending={create.pending}>{t("requestContacts.create.submit")}</SubmitButton>
          </div>
        </form>
      </FormProvider>
      <OperationOutcome operation={create} success={t("requestContacts.create.success", { id: create.variables?.id.trim() ?? "" })}>
        {(contact) => <RequestContactDetails contact={contact} />}
      </OperationOutcome>
    </div>
  );
}

interface TemplateChange {
  id: string;
  update: ObjectUpdate;
}

function ChangeForm({ contact, change }: { contact: RequestContact; change: Operation<TemplateChange, RequestContact> }) {
  const form = useForm<UriTemplateValues>({ defaultValues: { uriTemplate: contact.uriTemplate } });
  const template = useWatch({ control: form.control, name: "uriTemplate" });
  // The extension's example of a partial update replaces /uriTemplate; the template is sent as typed.
  const operations = useMemo(
    (): PatchOperation[] => (template === contact.uriTemplate ? [] : [{ op: "replace", path: "/uriTemplate", value: template }]),
    [template, contact.uriTemplate],
  );
  const plan = useObjectUpdate(`${REQUEST_CONTACT_RESOURCE.schemaPrefix}.update`, contact, operations);
  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(() => plan.update && change.start({ id: contact.id, update: plan.update }))}
        noValidate
        className="flex max-w-xl flex-col gap-6"
      >
        <h3>
          {t("requestContacts.change.heading")} <code>{contact.id}</code>
        </h3>
        <UriTemplateField />
        <section aria-label={t("requestContacts.change.sendLabel")} className="flex flex-col gap-2 rounded-md border border-border p-4">
          <h4 className="font-semibold">{t("requestContacts.change.sendLabel")}</h4>
          {operations.length === 0 ? (
            <p className="text-muted-foreground">{t("requestContacts.change.nothingChanged")}</p>
          ) : (
            <p>{t("requestContacts.change.replaceTemplate")}</p>
          )}
          <UpdateModeSection plan={plan} />
        </section>
        <div>
          <SubmitButton pending={change.pending} disabled={!plan.update}>{t("requestContacts.change.save")}</SubmitButton>
        </div>
      </form>
    </FormProvider>
  );
}

export function ChangePanel({ id, onIdChange }: PanelProps) {
  const workflows = useRequestContactWorkflows();
  const store = useRequestContactStore();
  const contact = useCachedRequestContact(id);
  const load = useOperation(
    (variables: string, signal) => workflows.info(variables, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables, result.data);
    },
  );
  // Held here, not in the form: the form starts over when the saved request contact replaces the loaded one.
  const change = useOperation(
    (variables: TemplateChange, signal) => workflows.update(variables.id, variables.update, { signal }),
    (result, variables) => {
      if (result.data) store.remember(variables.id, result.data);
      else store.forget(variables.id);
    },
  );

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          load.start(id);
        }}
        className="flex max-w-xl flex-col gap-5"
      >
        <HandleField id={id} onIdChange={onIdChange} />
        <div>
          <SubmitButton pending={load.pending}>{contact ? t("requestContacts.change.loadAgain") : t("requestContacts.change.load")}</SubmitButton>
        </div>
      </form>
      <OperationOutcome operation={load} success={t("requestContacts.change.loaded")} />
      {!contact && !load.pending && !load.failure && !load.cancelled && !load.result && (
        <Callout tone="info" title={t("requestContacts.change.loadFirst")}>
          {t("requestContacts.change.loadFirstHint")}
        </Callout>
      )}
      {contact && <ChangeForm key={`${contact.id}${contact.uriTemplate}`} contact={contact} change={change} />}
      <OperationOutcome operation={change} success={t("requestContacts.change.success", { id: change.variables?.id ?? "" })}>
        {(changed) => <RequestContactDetails contact={changed} />}
      </OperationOutcome>
    </div>
  );
}
