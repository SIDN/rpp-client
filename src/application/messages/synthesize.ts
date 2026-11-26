import { t } from "@/i18n";
import type { Message } from "@/rpp/core/types/objects";
import { MESSAGE_TYPES, messageTypeOf } from "./messages";

export const EXAMPLES_PER_TYPE = 2;

/** The identifier of a synthesized message starts with this, so that it cannot be taken for one the server sent. */
export const SYNTHETIC_PREFIX = "SYNTH-";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Two examples of every message type of the draft, oldest first as a queue is; none of it comes from a server. */
export function synthesizeMessages(options: { now?: Date; types?: readonly string[] } = {}): Message[] {
  const now = (options.now ?? new Date()).getTime();
  const at = (offset: number) => new Date(now + offset).toISOString().replace(/\.\d{3}Z$/, "Z");

  const examples: Record<string, [Record<string, unknown>, Record<string, unknown>]> = {
    reviewResponseMessage: [
      {
        objectType: "domainName",
        objectId: "approved.example.test",
        approved: true,
        clientTransactionId: "CLT-1001",
        serverTransactionId: "SRV-5001",
        completionDate: at(-6 * DAY),
        message: t("messages.synthetic.registrationApproved"),
        process: { "@type": "createProcess", processId: "P-1001" },
      },
      {
        objectType: "contact",
        objectId: "C-2002",
        approved: false,
        serverTransactionId: "SRV-5002",
        completionDate: at(-5 * DAY),
        message: t("messages.synthetic.updateDenied"),
      },
    ],
    transferRequestMessage: [
      {
        objectType: "domainName",
        objectId: "leaving.example.test",
        status: "pending",
        requestDate: at(-4 * DAY),
        actionDate: at(DAY),
        process: { "@type": "domainTransferProcess", processId: "T-3001", trStatus: "pending", transferDir: "pull", reqClientId: "gaining-registrar", requestDate: at(-4 * DAY), actClientId: "my-registrar", actionDate: at(DAY) },
      },
      { objectType: "contact", objectId: "C-3002", status: "pending", requestDate: at(-3 * DAY) },
    ],
    transferOutcomeMessage: [
      {
        objectType: "domainName",
        objectId: "moved.example.test",
        trStatus: "serverApproved",
        requestDate: at(-9 * DAY),
        actionDate: at(-4 * DAY),
        expiryDate: at(361 * DAY),
        process: { "@type": "domainTransferProcess", processId: "T-4001", trStatus: "serverApproved", reqClientId: "gaining-registrar", requestDate: at(-9 * DAY), actClientId: "my-registrar", actionDate: at(-4 * DAY), expiryDate: at(361 * DAY) },
      },
      { objectType: "contact", objectId: "C-4002", trStatus: "clientRejected", requestDate: at(-8 * DAY), actionDate: at(-7 * DAY) },
    ],
    expirationDeletionMessage: [
      { objectType: "domainName", objectId: "expired.example.test", deletionDate: at(-3 * DAY) },
      { objectType: "host", objectId: "ns1.expired.example.test", deletionDate: at(-2 * DAY) },
    ],
    autoRenewalMessage: [
      { objectType: "domainName", objectId: "renewed.example.test", renewalDate: at(-2 * DAY), expiryDate: at(363 * DAY) },
      { objectType: "domainName", objectId: "also-renewed.example.test", renewalDate: at(-DAY), expiryDate: at(364 * DAY) },
    ],
    serviceNoticeMessage: [
      { message: t("messages.synthetic.maintenance") },
      { message: t("messages.synthetic.newTerms") },
    ],
  };

  const wanted = options.types && options.types.length > 0 ? new Set(options.types) : undefined;
  const messages: Message[] = [];
  let sequence = 0;
  for (const { id: type } of MESSAGE_TYPES) {
    for (const [index, data] of (examples[type] ?? []).entries()) {
      sequence += 1;
      messages.push({
        "@type": "message",
        id: `${SYNTHETIC_PREFIX}${String(sequence).padStart(3, "0")}`,
        creationDate: at(-(7 - index) * DAY + sequence * HOUR),
        status: "delivered",
        data: { "@type": type, ...data },
      } as Message);
    }
  }
  return messages
    .filter((message) => !wanted || wanted.has(messageTypeOf(message)))
    .sort((a, b) => String(a.creationDate).localeCompare(String(b.creationDate)));
}

export const isSynthetic = (message: Message): boolean => typeof message.id === "string" && message.id.startsWith(SYNTHETIC_PREFIX);
