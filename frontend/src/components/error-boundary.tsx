"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          width: "100vw",
          background: "var(--color-mist)",
          padding: 32,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <p
            style={{
              fontSize: 18,
              color: "var(--color-midnight-ink)",
              fontWeight: "var(--font-weight-medium)",
              marginBottom: 8,
            }}
          >
            Terjadi kesalahan pada aplikasi
          </p>
          <p
            style={{
              fontSize: 13,
              color: "var(--color-steel)",
              lineHeight: 1.5,
              marginBottom: 20,
            }}
          >
            {this.state.error?.message ?? "Kesalahan tidak diketahui"}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 24px",
              borderRadius: "var(--radius-md)",
              border: "none",
              background: "var(--color-indigo-ink)",
              color: "#fff",
              fontSize: 13,
              fontWeight: "var(--font-weight-medium)",
              cursor: "pointer",
              letterSpacing: "-0.13px",
            }}
          >
            Muat Ulang
          </button>
        </div>
      </div>
    );
  }
}
