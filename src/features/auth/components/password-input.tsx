"use client"

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/src/lib/utils"

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type">

/**
 * Password field with a show/hide toggle (issue #165).
 *
 * The toggle is a separate `type="button"` (never submits the form) exposed
 * as a switch: `aria-checked` reflects whether the password is visible. The
 * input reserves right padding so typed text never sits under the icon.
 * Toggling keeps the value and the cursor in the field.
 */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = React.useState(false)
  const Icon = visible ? Eye : EyeOff

  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-10", className)} />
      <button
        type="button"
        role="switch"
        aria-checked={visible}
        aria-label="Toggle password visibility"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Icon className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}
