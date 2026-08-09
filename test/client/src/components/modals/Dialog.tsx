import { useEffect } from 'react';
import { useUi } from '../../store/ui';
import { classNames } from '../../utils/format';

interface Props {
  title: string;
  subtitle?: string;
  large?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
  onClose?: () => void;
}

export function Dialog({ title, subtitle, large, footer, children, onClose }: Props) {
  const close = onClose || useUi.getState().closeDialog;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  return (
    <div className="dialog-backdrop" onClick={close}>
      <div
        className={classNames('dialog', large && 'dialog-lg')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <div>
            <div className="font-semibold text-slate-900">{title}</div>
            {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
          </div>
          <button type="button" onClick={close} aria-label="Close" className="text-slate-500 hover:text-slate-700">
            ×
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>
  );
}
