import React from 'react';
import {ArixMascot} from './ArixMascot';
import {Button} from './ui/button';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  {children: React.ReactNode},
  ErrorBoundaryState
> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = {hasError: false, message: ''};
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Arix AI ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen arix-backdrop flex items-center justify-center p-6">
          <div className="arix-glass rounded-2xl p-8 max-w-md w-full text-center space-y-4">
            <div className="flex justify-center">
              <ArixMascot size="md" mood="idle" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Something went wrong
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {this.state.message}
            </p>
            <Button
              onClick={() => window.location.reload()}
              className="w-full"
            >
              Reload workspace
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
