"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value: ToastContextValue = {
    show,
    success: (m) => show(m, "success"),
    error: (m) => show(m, "error"),
    info: (m) => show(m, "info"),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 4000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
        fontFamily: "var(--font-manrope)",
      }}
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const accent = toastAccent(toast.variant);
  const Icon = toastIcon(toast.variant);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        pointerEvents: "auto",
        minWidth: 240,
        maxWidth: 380,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px",
        background: "var(--color-pure-white)",
        border: `1px solid var(--color-frost)`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: "var(--radius-md)",
        animation: "response-tooltip-fade 0.18s ease-out",
      }}
    >
      <span style={{ color: accent, display: "inline-flex", paddingTop: 1 }}>
        <Icon size={16} strokeWidth={2.2} />
      </span>
      <div
        style={{
          flex: 1,
          fontSize: 12.5,
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--color-midnight-ink)",
          lineHeight: 1.4,
          wordBreak: "break-word",
        }}
      >
        {toast.message}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Tutup"
        style={{
          border: "none",
          background: "none",
          cursor: "pointer",
          color: "var(--color-slate)",
          display: "inline-flex",
          padding: 2,
        }}
      >
        <X size={14} strokeWidth={2.2} />
      </button>
    </div>
  );
}

function toastAccent(v: ToastVariant): string {
  if (v === "success") return "var(--color-si-low)";
  if (v === "error") return "var(--color-indigo-ink)";
  return "var(--color-route-7)";
}

function toastIcon(v: ToastVariant) {
  if (v === "success") return CheckCircle2;
  if (v === "error") return AlertCircle;
  return Info;
}
