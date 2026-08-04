import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

type ErrorBoundaryState = { error: Error | null };

export class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AI Cost Explorer render error', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fatal-state">
          <div>
            <Sparkles size={28} />
            <h1>This view is unavailable</h1>
            <p>
              Something went wrong while rendering this page. Reload the app or return to the
              overview.
            </p>
            <a className="button button-primary" href={import.meta.env.BASE_URL}>
              Return to overview <ArrowRight size={16} />
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
