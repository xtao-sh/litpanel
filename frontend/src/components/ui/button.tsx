import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-[var(--r)] text-sm font-medium ring-offset-[var(--paper)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[var(--ink)] text-[var(--paper)] shadow-[var(--shadow-1)] hover:bg-[var(--ink-2)]",
        destructive: "bg-[var(--rust)] text-[var(--paper)] hover:bg-[var(--rust)]/90",
        outline:
          "border border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] hover:border-[var(--ink-5)] hover:bg-[var(--paper-2)]",
        secondary: "bg-[var(--paper-2)] text-[var(--ink-2)] hover:bg-[var(--paper-3)]",
        ghost: "text-[var(--ink-3)] hover:bg-[var(--paper-2)] hover:text-[var(--ink)]",
        link: "text-[var(--forest)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-[0.4rem] px-3",
        lg: "h-11 rounded-[0.5rem] px-8",
        pill: "h-8 rounded-full px-4 text-xs",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
