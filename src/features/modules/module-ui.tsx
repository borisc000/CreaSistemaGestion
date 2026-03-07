"use client";

import clsx from "clsx";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

export function ModulePage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="module-page">
      <header className="module-header">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

export function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <article className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {right}
      </div>
      {children}
    </article>
  );
}

export function ModuleActionBar({ children }: { children: ReactNode }) {
  return <div className="module-action-bar">{children}</div>;
}

export function KpiGrid({ items }: { items: Array<{ label: string; value: string | number }> }) {
  return (
    <section className="kpi-grid">
      {items.map((item) => (
        <article className="kpi-card" key={item.label}>
          <p>{item.label}</p>
          <strong>{item.value}</strong>
        </article>
      ))}
    </section>
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="inline-error">{message}</p>;
}

export function StatusBadge({ tone, children }: { tone: "good" | "warn" | "risk"; children: ReactNode }) {
  return <span className={clsx("status-badge", `status-${tone}`)}>{children}</span>;
}

export function EmptyState({ message }: { message: string }) {
  return <div className="empty-state">{message}</div>;
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-stack" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div className="skeleton-row" key={`skeleton-${index}`} />
      ))}
    </div>
  );
}

export function Toast({
  message,
  tone = "info"
}: {
  message: string | null;
  tone?: "info" | "success" | "error";
}) {
  if (!message) return null;
  return <p className={clsx("toast", `toast-${tone}`)}>{message}</p>;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
    )
  ).filter((element) => !element.hasAttribute("hidden"));
}

export function FormDrawer({
  isOpen,
  title,
  description,
  onClose,
  children
}: {
  isOpen: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const drawerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";

    const focusDrawer = () => {
      if (!drawerRef.current) return;
      const focusable = getFocusableElements(drawerRef.current);
      (focusable[0] || drawerRef.current).focus();
    };
    const timer = window.setTimeout(focusDrawer, 0);

    return () => {
      window.clearTimeout(timer);
      window.document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab" || !drawerRef.current) return;
    const focusable = getFocusableElements(drawerRef.current);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = window.document.activeElement as HTMLElement | null;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!isOpen) return null;

  return (
    <div className="form-drawer-layer" role="presentation">
      <button className="form-drawer-backdrop" type="button" aria-label="Cerrar formulario" onClick={onClose} />
      <div
        className="form-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="form-drawer-head">
          <div className="form-drawer-heading">
            <h2 id={titleId}>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button className="btn-secondary" type="button" onClick={onClose} aria-label="Cerrar">
            Cerrar
          </button>
        </header>
        <div className="form-drawer-body">{children}</div>
      </div>
    </div>
  );
}
