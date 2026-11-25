import { useRef, useState, type FormEvent } from "react";
import { Send, Square } from "lucide-react";
import { useConnection } from "@/app/connection-context";
import { PageHeader, Section } from "@/components/common/layout";
import { NotConnected } from "@/components/common/NotConnected";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Choice } from "@/components/ui/choice";
import { Field, Input, Select } from "@/components/ui/field";
import { REQUEST_SAMPLES, type RequestSample } from "@/application/developer/requestSamples";
import { buildRawRequest, RAW_METHODS, type RawRequestField, type RawRequestForm } from "@/application/developer/rawRequest";
import { TransportError } from "@/rpp/errors/TransportError";
import type { ExchangeRecord } from "@/rpp/client/diagnostics";
import { ExchangeDetail } from "../exchanges/ExchangesPage";

const INITIAL: RawRequestForm = { method: "GET", target: "", query: "", headers: "", body: "", clientTransactionId: "", authenticate: true };

const TEXTAREA = "w-full rounded-md border border-input bg-surface px-3 py-2 font-mono text-sm text-surface-foreground";

const SAMPLE_GROUPS: [string, RequestSample[]][] = [...Map.groupBy(REQUEST_SAMPLES, (sample) => sample.group)];

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
        <PageHeader title="Raw request" description="Send any request to the server as typed." />
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
      setOutcome(record ? { kind: "exchange", record } : { kind: "failed", message: "The exchange is no longer in the log." });
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
        title="Raw request"
        description="Send any request to the server as typed. Nothing is added or corrected, so what you enter is what is sent. The answer is the redacted exchange, as in Exchanges."
      />
      <Callout tone="warning" title="This sends real requests">
        A POST, PUT, PATCH or DELETE changes what the registry holds. Requests carry the credentials of the connection unless you switch that off.
      </Callout>

      <Section id="request" title="Request">
        <form onSubmit={send} noValidate className="flex max-w-3xl flex-col gap-5">
          <Field label="Sample request" hint="Fills in the method, path, query, headers and body with an example to edit. Replaces what is entered there.">
            {(control) => (
              <Select {...control} value="" onChange={(event) => applySample(event.target.value)}>
                <option value="">Choose a request…</option>
                {SAMPLE_GROUPS.map(([group, samples]) => (
                  <optgroup key={group} label={group}>
                    {samples.map((sample) => (
                      <option key={sample.id} value={sample.id}>
                        {sample.label} ({sample.method})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex flex-wrap items-start gap-3">
            <Field label="Method">
              {(control) => (
                <Select {...control} value={form.method} onChange={(event) => set("method", event.target.value as RawRequestForm["method"])}>
                  {RAW_METHODS.map((method) => (
                    <option key={method}>{method}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label="Path or address"
              hint="Relative to the server address, or a full address on an allowed origin."
              error={problems.target}
              className="min-w-64 flex-1"
            >
              {(control) => (
                <Input {...control} value={form.target} placeholder="domainNames/example.nl" className="font-mono" spellCheck={false} autoCapitalize="none" onChange={(event) => set("target", event.target.value)} />
              )}
            </Field>
          </div>
          <Field label="Query parameters" hint="One name=value per line. Repeat a name to send it more than once." error={problems.query}>
            {(control) => <textarea {...control} rows={3} value={form.query} className={TEXTAREA} spellCheck={false} onChange={(event) => set("query", event.target.value)} />}
          </Field>
          <Field label="Extra headers" hint="One Name: value per line. Accept, Content-Type, RPP-Preset, RPP-Cltrid and credentials are set by the client." error={problems.headers}>
            {(control) => <textarea {...control} rows={3} value={form.headers} className={TEXTAREA} spellCheck={false} onChange={(event) => set("headers", event.target.value)} />}
          </Field>
          <Field label="Body" hint="JSON. Leave empty for no body." error={problems.body}>
            {(control) => <textarea {...control} rows={8} value={form.body} className={TEXTAREA} spellCheck={false} onChange={(event) => set("body", event.target.value)} />}
          </Field>
          <Field label="RPP-Cltrid" hint="Leave empty to let the client make one." error={problems.clientTransactionId} className="max-w-64">
            {(control) => <Input {...control} value={form.clientTransactionId} className="font-mono" autoComplete="off" onChange={(event) => set("clientTransactionId", event.target.value)} />}
          </Field>
          <Choice
            type="checkbox"
            label="Send the credentials"
            hint="Switch off to try the request without signing in."
            checked={form.authenticate}
            onChange={(event) => set("authenticate", event.target.checked)}
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              <Send aria-hidden />
              {pending ? "Sending…" : "Send request"}
            </Button>
            {pending && (
              <Button variant="secondary" onClick={() => abort.current?.abort()}>
                <Square aria-hidden />
                Stop waiting
              </Button>
            )}
          </div>
        </form>
      </Section>

      {outcome?.kind === "exchange" && (
        <div role="region" aria-label="Exchange" className="mt-8">
          <ExchangeDetail record={outcome.record} />
        </div>
      )}
      {outcome?.kind === "failed" && (
        <Callout tone="danger" title="The request was not sent">
          {outcome.message}
        </Callout>
      )}
      {outcome?.kind === "cancelled" && <Callout tone="info" title="Stopped waiting">The registry may still have acted on the request.</Callout>}
    </>
  );
}
