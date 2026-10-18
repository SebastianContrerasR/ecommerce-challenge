import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export type ModalWidth = "sm" | "md" | "lg";
export type ModalPlacement = "center" | "right";

const WIDTHS: Record<ModalWidth, string> = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-3xl",
};

const WRAPPERS: Record<ModalPlacement, string> = {
  center: "flex items-center justify-center p-4",
  right: "flex items-stretch justify-end",
};

const PANEL_EXTRAS: Record<ModalPlacement, string> = {
  center: "max-h-[85vh]",
  right: "h-full max-h-none rounded-none border-y-0 border-r-0 drawer-panel",
};

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  description?: string | undefined;
  footer?: ReactNode | undefined;
  width?: ModalWidth | undefined;
  placement?: ModalPlacement | undefined;
  closeLabel?: string | undefined;
  bodyClassName?: string | undefined;
}

export function Modal({
  title,
  onClose,
  children,
  description,
  footer,
  width = "md",
  placement = "center",
  closeLabel = "Close dialog",
  bodyClassName = "px-5 py-4",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const panel = panelRef.current;
    if (panel === null) {
      return;
    }
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) {
      event.preventDefault();
      panel.focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className={`fixed inset-0 z-50 ${WRAPPERS[placement]}`}>
      <div onClick={onClose} aria-hidden="true" className="absolute inset-0 bg-slate-900/50" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description === undefined ? undefined : descriptionId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`card relative flex w-full flex-col shadow-xl outline-none ${PANEL_EXTRAS[placement]} ${WIDTHS[width]}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            {description !== undefined && (
              <p id={descriptionId} className="mt-1 text-sm text-slate-600">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="cursor-pointer rounded-md p-1.5 text-lg leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>
        {footer !== undefined && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
