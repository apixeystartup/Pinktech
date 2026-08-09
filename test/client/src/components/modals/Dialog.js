import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { useUi } from '../../store/ui';
import { classNames } from '../../utils/format';
export function Dialog({ title, subtitle, large, footer, children, onClose }) {
    const close = onClose || useUi.getState().closeDialog;
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape')
                close();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [close]);
    return (_jsx("div", { className: "dialog-backdrop", onClick: close, children: _jsxs("div", { className: classNames('dialog', large && 'dialog-lg'), onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "dialog-header", children: [_jsxs("div", { children: [_jsx("div", { className: "font-semibold text-slate-900", children: title }), subtitle && _jsx("div", { className: "text-xs text-slate-500 mt-0.5", children: subtitle })] }), _jsx("button", { type: "button", onClick: close, "aria-label": "Close", className: "text-slate-500 hover:text-slate-700", children: "\u00D7" })] }), _jsx("div", { className: "dialog-body", children: children }), footer && _jsx("div", { className: "dialog-footer", children: footer })] }) }));
}
