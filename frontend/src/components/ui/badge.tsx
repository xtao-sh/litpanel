import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--forest)] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[var(--ink)] text-[var(--paper)]",
        secondary: "border-transparent bg-[var(--paper-2)] text-[var(--ink-3)]",
        destructive: "border-transparent bg-[var(--rust)] text-[var(--paper)]",
        outline: "text-[var(--ink)] border-[var(--line-soft)]",
        paper: "bg-[var(--paper-2)] text-[var(--ink-3)] border-[var(--line-soft)]",
        mechanism: "bg-[#f4ead8] text-[#7a5a18] border-transparent",
        method: "bg-[var(--forest-soft)] text-[var(--forest-2)] border-transparent",
        dataset: "bg-[#e9eef6] text-[#2c4870] border-transparent",
        puzzle: "bg-[#f4dfd5] text-[#8a3318] border-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
