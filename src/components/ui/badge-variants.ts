import { cva, type VariantProps } from "class-variance-authority";

export const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium", {
  variants: {
    tone: {
      neutral: "bg-muted text-foreground",
      success: "bg-success-soft text-success-ink",
      warning: "bg-warning-soft text-warning-ink",
      danger: "bg-danger-soft text-danger-ink",
      info: "bg-info-soft text-info-ink",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export type Tone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;
