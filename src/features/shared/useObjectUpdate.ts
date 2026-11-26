import { useMemo, useState } from "react";
import { useConnection } from "@/app/connection-context";
import { fullUpdateOf, type FullUpdate, type ObjectUpdate } from "@/application/updates/objectUpdate";
import { DEFAULT_UPDATE_MODE, type UpdateMode } from "@/config/connectionProfile";
import type { PatchOperation } from "@/rpp/operations/patch";
import { t } from "@/i18n";
import { usePresetSchema } from "./presetSchema";

export type FullUpdateState = FullUpdate | { status: "loading" };

export interface UpdatePlan {
  mode: UpdateMode;
  setMode(mode: UpdateMode): void;
  operations: readonly PatchOperation[];
  /** Only worked out while the mode is full. */
  full: FullUpdateState | undefined;
  /** What to send, or undefined while nothing can be sent in this mode. */
  update: ObjectUpdate | undefined;
}

/**
 * How a Change screen sends its edits: the operations as a partial update, or the full update worked out from them
 * with the update definition (`definition`, such as `domainName.update`) of the Preset Schema. The mode starts as the
 * connection says and can be switched per screen. Nothing is sent when nothing changed, in either mode.
 */
export function useObjectUpdate(definition: string, current: object, operations: readonly PatchOperation[]): UpdatePlan {
  const { session } = useConnection();
  const [mode, setMode] = useState<UpdateMode>(session?.profile.updateMode ?? DEFAULT_UPDATE_MODE);
  const { query } = usePresetSchema(mode === "full");
  const document = query.data?.document;
  const failed = query.isError ? query.error : undefined;
  const full = useMemo((): FullUpdateState | undefined => {
    if (mode !== "full") return undefined;
    if (failed) return { status: "unavailable", reason: t("updates.full.schemaFailed", { reason: failed.message }) };
    if (document === undefined) return query.isPending && query.fetchStatus !== "idle" ? { status: "loading" } : fullUpdateOf(undefined, definition, current, operations);
    return fullUpdateOf(document, definition, current, operations);
  }, [mode, failed, document, query.isPending, query.fetchStatus, definition, current, operations]);

  const update: ObjectUpdate | undefined =
    operations.length === 0
      ? undefined
      : mode === "partial"
        ? { mode: "partial", operations }
        : full?.status === "ready"
          ? { mode: "full", body: full.body, includeElements: full.includeElements }
          : undefined;
  return { mode, setMode, operations, full, update };
}

