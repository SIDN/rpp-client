import { z } from "zod";
import { getLocale, t } from "@/i18n";

const envSchema = z.object({
  VITE_APP_TITLE: z.string().trim().min(1).optional(),
  VITE_RPP_BASE_URL: z.union([z.literal(""), z.url()]).optional(),
});

export interface AppEnv {
  appTitle: string;
  /** Prefills the connection form; never connects by itself. */
  defaultBaseUrl: string | undefined;
}

/** Reads the public Vite variables and fails at startup, naming the variable, when one is malformed. */
export function readEnv(raw: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => {
      const message = getLocale() === "en" ? issue.message : issue.code === "invalid_format" ? t("config.env.invalidUrl") : t("config.env.invalidValue");
      return `${issue.path.join(".")}: ${message}`;
    }).join("; ");
    throw new Error(t("config.env.invalid", { problems }));
  }
  return {
    appTitle: parsed.data.VITE_APP_TITLE ?? "RPP Client",
    defaultBaseUrl: parsed.data.VITE_RPP_BASE_URL || undefined,
  };
}

export const env: AppEnv = readEnv(import.meta.env);
