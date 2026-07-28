import { ARENA_ACCESS_DENIED_MESSAGE } from '@/lib/arena-email-constants'

/**
 * Shown when the Arena iframe is opened without a valid emailId.
 */
export default function AccessDeniedPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--ds-color-surface-subtle)] px-[var(--ds-spacing-component-lg)] py-[var(--ds-spacing-layout-md)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--ds-color-brand-surface)_0%,_transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/3 size-64 rounded-full bg-[var(--ds-color-brand-default)] opacity-[0.06] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 bottom-1/4 size-56 rounded-full bg-[var(--ds-color-brand-default)] opacity-[0.08] blur-3xl"
      />

      <section
        className="relative w-full max-w-[440px] rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-raised)] p-[var(--ds-spacing-component-xl)] shadow-[var(--ds-elevation-md)]"
        style={{
          animation: 'arena-access-in var(--ds-motion-duration-slow) var(--ds-motion-easing-decelerate) both',
        }}
      >
        <div className="mb-[var(--ds-spacing-component-lg)] flex size-14 items-center justify-center rounded-[var(--ds-radius-md)] bg-[var(--ds-color-brand-surface)] text-[var(--ds-color-brand-default)]">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            <circle cx="12" cy="16" r="1.25" fill="currentColor" stroke="none" />
          </svg>
        </div>

        <p className="mb-[var(--ds-spacing-component-xs)] text-xs font-medium tracking-wide text-[var(--ds-color-text-link)]">
          Arena
        </p>
        <h1 className="text-[length:var(--ds-type-heading-font-size)] font-semibold leading-[var(--ds-type-heading-line-height)] text-[var(--ds-color-text-primary)]">
          {ARENA_ACCESS_DENIED_MESSAGE}
        </h1>
        <p className="mt-[var(--ds-spacing-component-sm)] text-[length:var(--ds-type-body-font-size)] leading-[var(--ds-type-body-line-height)] text-[var(--ds-color-text-secondary)]">
          This experience only opens from a valid Arena invite link. Ask your host to resend the
          link that includes your email access token.
        </p>

        <div className="mt-[var(--ds-spacing-component-lg)] rounded-[var(--ds-radius-sm)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-subtle)] px-[var(--ds-spacing-component-md)] py-[var(--ds-spacing-component-sm)]">
          <p className="text-[length:var(--ds-type-caption-font-size)] leading-[var(--ds-type-caption-line-height)] tracking-wide text-[var(--ds-color-text-tertiary)]">
            Missing or empty{' '}
            <span className="font-medium text-[var(--ds-color-text-secondary)]">emailId</span> in
            the iframe URL.
          </p>
        </div>
      </section>

      <style>{`
        @keyframes arena-access-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  )
}
