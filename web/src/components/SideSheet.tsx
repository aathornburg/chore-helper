import { forwardRef, type ReactNode } from "react";

type SideSheetTone = "default" | "chore" | "commitment";

type SideSheetProps = {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  eyebrow: string;
  footer?: ReactNode;
  onClose: () => void;
  title: ReactNode;
  tone?: SideSheetTone;
};

export const SideSheet = forwardRef<HTMLElement, SideSheetProps>(function SideSheet({
  ariaLabel,
  children,
  className = "",
  eyebrow,
  footer,
  onClose,
  title,
  tone = "default"
}, ref) {
  return (
    <div
      className={`chore-editor-backdrop app-side-sheet-backdrop is-detail-view is-${tone}`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="presentation"
    >
      <aside
        aria-label={ariaLabel}
        aria-modal="true"
        className={`app-side-sheet is-${tone} ${className}`.trim()}
        ref={ref}
        role="dialog"
        tabIndex={-1}
      >
        <div className="app-side-sheet-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
          <button aria-label="Close dialog" className="icon-button modal-close-button" onClick={onClose} type="button" />
        </div>
        <div className="app-side-sheet-body">
          {children}
        </div>
        {footer ? <div className="app-side-sheet-footer form-actions modal-actions">{footer}</div> : null}
      </aside>
    </div>
  );
});
