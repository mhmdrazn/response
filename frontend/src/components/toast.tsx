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
    <div className="font-manrope pointer-events-none fixed bottom-[20px] right-[20px] z-[4000] flex flex-col gap-8">
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
      className="pointer-events-auto flex min-w-[240px] max-w-[380px] items-start gap-[10px] rounded-md border border-frost bg-pure-white px-12 py-[10px]"
      style={{ borderLeft: `3px solid ${accent}`, animation: "response-tooltip-fade 0.18s ease-out" }}
    >
      <span className="inline-flex pt-px" style={{ color: accent }}>
        <Icon size={16} strokeWidth={2.2} />
      </span>
      <div className="flex-1 break-words text-[12.5px] font-semibold leading-[1.4] text-midnight-ink">
        {toast.message}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Tutup"
        className="inline-flex cursor-pointer border-0 bg-transparent p-[2px] text-slate"
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
