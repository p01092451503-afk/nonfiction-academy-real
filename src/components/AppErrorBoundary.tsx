import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/errorReporter";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("App render error:", error);
    reportError({
      message: error.message || "React render error",
      stack: error.stack || "",
      source: "react-error-boundary",
      severity: "critical",
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="mx-auto h-11 w-11 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground">페이지를 불러오지 못했습니다</h1>
            <p className="text-sm text-muted-foreground">일시적인 화면 오류가 발생했습니다. 새로고침 후 다시 시도해주세요.</p>
          </div>
          <Button className="gap-2" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            새로고침
          </Button>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;