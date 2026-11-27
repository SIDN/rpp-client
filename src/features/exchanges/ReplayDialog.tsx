import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Choice } from "@/components/ui/choice";
import { Field, Input, Select } from "@/components/ui/field";
import { buildRawRequest, formFromExchange, RAW_METHODS, type RawRequestField, type RawRequestForm } from "@/application/developer/rawRequest";
import type { Session } from "@/application/connection/session";
import { t } from "@/i18n";
import type { ExchangeRecord } from "@/rpp/client/diagnostics";

const TEXTAREA = "w-full rounded-md border border-input bg-surface px-3 py-2 font-mono text-sm text-surface-foreground";

/**
 * Sends a recorded request again, after the user has changed it. The request is built exactly as typed, like on the
 * raw request screen; a new exchange is recorded, and `onSent` gets its id once the server has answered.
 */
export function ReplayDialog({ session, record, onClose, onSent }: { session: Session; record: ExchangeRecord; onClose(): void; onSent(exchangeId: string): void }) {
  const initial = useMemo(() => formFromExchange(record.request, session.profile.baseUrl), [record, session.profile.baseUrl]);
  const [form, setForm] = useState<RawRequestForm>(initial.form);
  const [problems, setProblems] = useState<Partial<Record<RawRequestField, string>>>({});
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);
  const abort = useRef<AbortController>(undefined);
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Closing while a request is out stops waiting for it; the exchange is still recorded.
  useEffect(() => () => abort.current?.abort(), []);

  const set = <K extends RawRequestField>(field: K, value: RawRequestForm[K]) => setForm((current) => ({ ...current, [field]: value }));

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const built = buildRawRequest(form);
    if (!built.ok) {
      setProblems(Object.fromEntries(built.problems.map(({ field, message }) => [field, message])));
      return;
    }
    setProblems({});
    setFailure(undefined);
    const controller = new AbortController();
    abort.current = controller;
    setPending(true);
    try {
      const response = await session.transport.send({ ...built.request, signal: controller.signal });
      onSent(response.exchangeId);
    } catch (error) {
      if (controller.signal.aborted) return;
      setFailure(error instanceof Error ? error.message : String(error));
      setPending(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="mt-8 mb-8 flex w-full max-w-3xl flex-col gap-4 rounded-md border bg-background p-6 shadow-lg">
        <div>
          <h2 id={titleId} className="text-lg font-semibold">
            {t("exchanges.replay.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("exchanges.replay.description")}</p>
        </div>
        {initial.hasRedactions && (
          <Callout tone="warning" title={t("exchanges.replay.redacted.title")}>
            {t("exchanges.replay.redacted.description")}
          </Callout>
        )}
        <form onSubmit={send} noValidate className="flex flex-col gap-5">
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
            <Field label={t("developer.fields.target")} hint={t("developer.fields.targetHint")} error={problems.target} className="min-w-64 flex-1">
              {(control) => <Input {...control} value={form.target} className="font-mono" spellCheck={false} autoCapitalize="none" onChange={(event) => set("target", event.target.value)} />}
            </Field>
          </div>
          <Field label={t("developer.fields.query")} hint={t("developer.fields.queryHint")} error={problems.query}>
            {(control) => <textarea {...control} rows={2} value={form.query} className={TEXTAREA} spellCheck={false} onChange={(event) => set("query", event.target.value)} />}
          </Field>
          <Field label={t("developer.fields.headers")} hint={t("developer.fields.headersHint")} error={problems.headers}>
            {(control) => <textarea {...control} rows={3} value={form.headers} className={TEXTAREA} spellCheck={false} onChange={(event) => set("headers", event.target.value)} />}
          </Field>
          <Field label={t("developer.fields.body")} hint={t("developer.fields.bodyHint")} error={problems.body}>
            {(control) => <textarea {...control} rows={10} value={form.body} className={TEXTAREA} spellCheck={false} onChange={(event) => set("body", event.target.value)} />}
          </Field>
          <Choice
            type="checkbox"
            label={t("developer.fields.sendCredentials")}
            hint={t("developer.fields.sendCredentialsHint")}
            checked={form.authenticate}
            onChange={(event) => set("authenticate", event.target.checked)}
          />
          {failure !== undefined && (
            <Callout tone="danger" title={t("exchanges.replay.failed")}>
              {failure}
            </Callout>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              <Send aria-hidden />
              {pending ? t("developer.sending") : t("exchanges.replay.send")}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              {t("exchanges.replay.cancel")}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
