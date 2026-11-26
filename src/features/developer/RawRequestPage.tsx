import { useRef, useState, type FormEvent } from "react";
import { Send, Square } from "lucide-react";
import { useConnection } from "@/app/connection-context";
import { PageHeader, Section } from "@/components/common/layout";
import { NotConnected } from "@/components/common/NotConnected";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Choice } from "@/components/ui/choice";
import { Field, Input, Select } from "@/components/ui/field";
import { t } from "@/i18n";
import { REQUEST_SAMPLES, type RequestSample } from "@/application/developer/requestSamples";
import { buildRawRequest, RAW_METHODS, type RawRequestField, type RawRequestForm } from "@/application/developer/rawRequest";
import { TransportError } from "@/rpp/errors/TransportError";
import type { ExchangeRecord } from "@/rpp/client/diagnostics";
import { ExchangeDetail } from "../exchanges/ExchangesPage";

const INITIAL: RawRequestForm = { method: "GET", target: "", query: "", headers: "", body: "", clientTransactionId: "", authenticate: true };

const TEXTAREA = "w-full rounded-md border border-input bg-surface px-3 py-2 font-mono text-sm text-surface-foreground";

const SAMPLE_GROUPS: [string, RequestSample[]][] = REQUEST_SAMPLES.reduce<[string, RequestSample[]][]>((groups, sample) => {
  const group = groups.find(([name]) => name === sample.group);
  if (group) group[1].push(sample);
  else groups.push([sample.group, [sample]]);
  return groups;
}, []);

type Outcome = { kind: "exchange"; record: ExchangeRecord } | { kind: "failed"; message: string } | { kind: "cancelled" };

export function RawRequestPage() {
  const { session } = useConnection();
  const [form, setForm] = useState<RawRequestForm>(INITIAL);
  const [problems, setProblems] = useState<Partial<Record<RawRequestField, string>>>({});
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>();
  const abort = useRef<AbortController>(undefined);

  if (!session) {
    return (
      <>
        <PageHeader title={t("developer.page.title")} description={t("developer.page.descriptionDisconnected")} />
        <NotConnected />
      </>
    );
  }

  const set = <K extends RawRequestField>(field: K, value: RawRequestForm[K]) => setForm((current) => ({ ...current, [field]: value }));

  const applySample = (id: string) => {
    const sample = REQUEST_SAMPLES.find((entry) => entry.id === id);
    if (!sample) return;
    setProblems({});
    setForm((current) => ({
      ...current,
      method: sample.method,
      target: sample.target,
      query: sample.query ?? "",
      headers: sample.headers ?? "",
      body: sample.body === undefined ? "" : JSON.stringify(sample.body, null, 2),
    }));
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const built = buildRawRequest(form);
    if (!built.ok) {
      setProblems(Object.fromEntries(built.problems.map(({ field, message }) => [field, message])));
      return;
    }
    setProblems({});
    const controller = new AbortController();
    abort.current = controller;
    setPending(true);
    setOutcome(undefined);
    try {
      const response = await session.transport.send({ ...built.request, signal: controller.signal });
      const record = session.exchanges.entries().find((entry) => entry.id === response.exchangeId);
      setOutcome(record ? { kind: "exchange", record } : { kind: "failed", message: t("developer.failure.exchangeMissing") });
    } catch (error) {
      if (controller.signal.aborted) setOutcome({ kind: "cancelled" });
      else if (error instanceof TransportError && error.exchange) setOutcome({ kind: "exchange", record: error.exchange });
      else setOutcome({ kind: "failed", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t("developer.page.title")}
        description={t("developer.page.description")}
      />
      <Callout tone="warning" title={t("developer.warning.title")}>
        {t("developer.warning.description")}
      </Callout>

      <Section id="request" title={t("developer.request.title")}>
        <form onSubmit={send} noValidate className="flex max-w-3xl flex-col gap-5">
          <Field label={t("developer.samples.label")} hint={t("developer.samples.hint")}>
            {(control) => (
              <Select {...control} value="" onChange={(event) => applySample(event.target.value)}>
                <option value="">{t("developer.samples.choose")}</option>
                {SAMPLE_GROUPS.map(([group, samples]) => (
                  <optgroup key={group} label={t(group)}>
                    {samples.map((sample) => (
                      <option key={sample.id} value={sample.id}>
                        {t(sample.label)} ({sample.method})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex flex-wrap items-start gap-3">
            <Field label={t("developer.fields.method")}>
              {(control) => (
                <Select {...control} value={form.method} onChange={(event) => set("method", event.target.value as RawRequestForm["method"])}>
                  {RAW_METHODS.map((method) => (
                    <option key={method}>{method}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label={t("developer.fields.target")}
              hint={t("developer.fields.targetHint")}
              error={problems.target}
              className="min-w-64 flex-1"
            >
              {(control) => (
                <Input {...control} value={form.target} placeholder={t("developer.fields.targetPlaceholder")} className="font-mono" spellCheck={false} autoCapitalize="none" onChange={(event) => set("target", event.target.value)} />
              )}
            </Field>
          </div>
          <Field label={t("developer.fields.query")} hint={t("developer.fields.queryHint")} error={problems.query}>
            {(control) => <textarea {...control} rows={3} value={form.query} className={TEXTAREA} spellCheck={false} onChange={(event) => set("query", event.target.value)} />}
          </Field>
          <Field label={t("developer.fields.headers")} hint={t("developer.fields.headersHint")} error={problems.headers}>
            {(control) => <textarea {...control} rows={3} value={form.headers} className={TEXTAREA} spellCheck={false} onChange={(event) => set("headers", event.target.value)} />}
          </Field>
          <Field label={t("developer.fields.body")} hint={t("developer.fields.bodyHint")} error={problems.body}>
            {(control) => <textarea {...control} rows={8} value={form.body} className={TEXTAREA} spellCheck={false} onChange={(event) => set("body", event.target.value)} />}
          </Field>
          <Field label="RPP-Cltrid" hint={t("developer.fields.transactionIdHint")} error={problems.clientTransactionId} className="max-w-64">
            {(control) => <Input {...control} value={form.clientTransactionId} className="font-mono" autoComplete="off" onChange={(event) => set("clientTransactionId", event.target.value)} />}
          </Field>
          <Choice
            type="checkbox"
            label={t("developer.fields.sendCredentials")}
            hint={t("developer.fields.sendCredentialsHint")}
            checked={form.authenticate}
            onChange={(event) => set("authenticate", event.target.checked)}
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              <Send aria-hidden />
              {pending ? t("developer.sending") : t("developer.sendRequest")}
            </Button>
            {pending && (
              <Button variant="secondary" onClick={() => abort.current?.abort()}>
                <Square aria-hidden />
                {t("developer.stopWaiting")}
              </Button>
            )}
          </div>
        </form>
      </Section>

      {outcome?.kind === "exchange" && (
        <div role="region" aria-label={t("exchanges.detail.exchange")} className="mt-8">
          <ExchangeDetail record={outcome.record} />
        </div>
      )}
      {outcome?.kind === "failed" && (
        <Callout tone="danger" title={t("developer.failure.title")}>
          {outcome.message}
        </Callout>
      )}
      {outcome?.kind === "cancelled" && <Callout tone="info" title={t("developer.cancelled.title")}>{t("developer.cancelled.description")}</Callout>}
    </>
  );
}
