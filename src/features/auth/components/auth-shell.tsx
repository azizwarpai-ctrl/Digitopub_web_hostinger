import type React from "react"
import Image from "next/image"

// Optimised 320px exports of the brand logo (the PNG originals are ~1 MB).
const LOGO = "/images/logo-digitopub-320.webp"
const LOGO_WHITE = "/images/logo-digitopub-white-320.webp"
const LOGO_RATIO = 342 / 320

interface AuthShellProps {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}

/**
 * Layout for the admin sign-in and password recovery pages: a brand panel
 * from lg up, a single column with a compact logo below that.
 */
export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <div className="grid min-h-[100dvh] w-full bg-background lg:grid-cols-[5fr_7fr]">
      <aside
        className="relative hidden flex-col justify-between overflow-hidden bg-brand-panel p-10 text-white lg:flex xl:p-14"
      >
        {/* Soft light falloff so the panel isn't a flat slab of colour. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,rgb(255_255_255/0.14),transparent_60%),radial-gradient(90%_70%_at_100%_100%,rgb(0_0_0/0.28),transparent_65%)]"
        />
        <Image
          src={LOGO_WHITE}
          alt="DigitoPub"
          width={160}
          height={Math.round(160 * LOGO_RATIO)}
          className="relative"
          priority
        />
        <p className="relative max-w-[22ch] text-2xl font-medium leading-snug tracking-tight text-white/90 text-balance">
          Manage journals, submissions and peer review in one place.
        </p>
      </aside>

      <main className="flex flex-col px-4 py-8 sm:px-8">
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
          <div className="mb-8 lg:hidden">
            <Image
              src={LOGO}
              alt=""
              width={60}
              height={Math.round(60 * LOGO_RATIO)}
              className="dark:hidden"
              priority
            />
            <Image
              src={LOGO_WHITE}
              alt=""
              width={60}
              height={Math.round(60 * LOGO_RATIO)}
              className="hidden dark:block"
            />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
          <div className="mt-8">{children}</div>
        </div>
        {footer && <div className="mx-auto mt-8 w-full max-w-sm text-sm text-muted-foreground">{footer}</div>}
      </main>
    </div>
  )
}
