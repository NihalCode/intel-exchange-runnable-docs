import type { ReactNode } from "react";

/**
 * Consistent page chrome: title, one-line purpose, optional primary action + status.
 * Keeps Atlas materials; strengthens orientation for first-time users.
 */
export function PageOrientation({
  eyebrow,
  title,
  description,
  atmosphere,
  primaryAction,
  status,
  help,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  /** Atmospheric secondary label shown under the title */
  atmosphere?: string;
  primaryAction?: ReactNode;
  status?: ReactNode;
  help?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={`atlas-page-orient ${className}`}
      data-testid="atlas-page-orient"
      data-layout="atlas-page-orient"
    >
      <div className="atlas-page-orient__main">
        {eyebrow ? <p className="atlas-micro-label atlas-page-orient__eyebrow">{eyebrow}</p> : null}
        <div className="atlas-page-orient__title-row">
          <h1 className="atlas-page-orient__title">{title}</h1>
          {atmosphere ? (
            <span className="atlas-page-orient__atmosphere" title={atmosphere}>
              {atmosphere}
            </span>
          ) : null}
        </div>
        {description ? <p className="atlas-page-orient__desc">{description}</p> : null}
        {help ? <div className="atlas-page-orient__help">{help}</div> : null}
      </div>
      {(primaryAction || status) && (
        <div className="atlas-page-orient__aside">
          {status ? <div className="atlas-page-orient__status">{status}</div> : null}
          {primaryAction ? <div className="atlas-page-orient__action">{primaryAction}</div> : null}
        </div>
      )}
    </header>
  );
}
