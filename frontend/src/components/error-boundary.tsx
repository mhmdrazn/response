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
      <div className="flex h-screen w-screen items-center justify-center bg-mist p-32">
        <div className="max-w-[420px] text-center">
          <p className="mb-8 text-[18px] font-medium text-midnight-ink">
            Terjadi kesalahan pada aplikasi
          </p>
          <p className="mb-[20px] text-[13px] leading-[1.5] text-steel">
            {this.state.error?.message ?? "Kesalahan tidak diketahui"}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="cursor-pointer rounded-md border-0 bg-indigo-ink px-24 py-[10px] text-[13px] font-medium tracking-[-0.13px] text-white"
          >
            Muat Ulang
          </button>
        </div>
      </div>
    );
  }
}
