import type { ReactNode } from "react";

type PageWidth = "wide" | "medium" | "narrow";

const WIDTHS: Record<PageWidth, string> = {
  wide: "",
  medium: "max-w-3xl",
  narrow: "max-w-2xl",
};

export function Page({
  label,
  width = "medium",
  children,
}: {
  label: string;
  width?: PageWidth;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className={`mx-auto w-full ${WIDTHS[width]}`}>
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string | undefined;
  actions?: ReactNode | undefined;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        {description !== undefined && (
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p>
        )}
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <div className="card empty-state">
      <p className="empty-state-title">{title}</p>
      {children !== undefined && <p className="empty-state-text">{children}</p>}
      {action}
    </div>
  );
}

export function SectionHeading({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {meta !== undefined && <p className="mt-0.5 text-xs text-slate-500">{meta}</p>}
      </div>
      {action}
    </div>
  );
}
