"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

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