import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Balance OS Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="min-h-screen bg-[#f6f7f8] dark:bg-[#0f1419] p-8 font-sans">
          <h1 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">
            Something went wrong
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-primary text-white font-medium hover:opacity-90"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
