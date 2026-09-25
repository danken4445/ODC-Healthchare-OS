import type { ReactNode } from "react";

export type AccessStateVariant = "loading" | "unauthorized" | "error";

export interface AccessStateProps {
  actionHref?: string;
  actionLabel?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  status?: ReactNode;
  title?: ReactNode;
  variant?: AccessStateVariant;
}

const defaultContent: Record<
  AccessStateVariant,
  { description: string; title: string }
> = {
  loading: {
    title: "Checking secure access…",
    description: "We are verifying your permissions.",
  },
  unauthorized: {
    title: "Unauthorized access",
    description: "You do not have permission to view this resource.",
  },
  error: {
    title: "Resource unavailable",
    description: "We could not securely verify this resource. Please try again.",
  },
};

/** Shared centered state for protected routes and resources. */
export function AccessState({
  actionHref = "/",
  actionLabel = "Return to workspace",
  description,
  eyebrow = "Secure access",
  status,
  title,
  variant = "unauthorized",
}: AccessStateProps) {
  const content = defaultContent[variant];

  return (
    <main className="odyssey-access-state-shell">
      <section
        aria-labelledby="odyssey-access-state-title"
        className="odyssey-access-state"
      >
        <div aria-hidden="true" className="odyssey-access-state__icon">
          {variant === "loading" ? "…" : "!"}
        </div>
        <p className="odyssey-access-state__eyebrow">{eyebrow}</p>
        <h1 id="odyssey-access-state-title">{title ?? content.title}</h1>
        <p className="odyssey-access-state__description">
          {description ?? content.description}
        </p>
        <a className="odyssey-access-state__action" href={actionHref}>
          {actionLabel}
        </a>
        {status ? (
          <p aria-live="polite" className="odyssey-access-state__status">
            {status}
          </p>
        ) : null}
      </section>
    </main>
  );
}
