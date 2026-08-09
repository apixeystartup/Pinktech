/* eslint-disable react-refresh/only-export-components */
import { useCallback, useContext, useMemo, useState } from "react";
import ToastContext from "./toast-context";

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const showToast = useCallback((message, type = "info") => {
    const id = `${Date.now()}_${Math.random()}`;
    setItems((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, 3000);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack">
        {items.map((item) => (
          <div key={item.id} className={`toast toast-${item.type}`}>
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider.");
  }
  return context;
}
