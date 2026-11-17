import {AlertCircle, RefreshCw} from 'lucide-react';
import React from 'react';
import {Button} from './ui/button';

interface AiErrorBannerProps {
  message: string;
  cooldownSeconds?: number;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function AiErrorBanner({
  message,
  cooldownSeconds = 0,
  onRetry,
  onDismiss,
}: AiErrorBannerProps) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-red-700 dark:text-red-300"
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>{message}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={cooldownSeconds > 0}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {cooldownSeconds > 0 ? `Retry (${cooldownSeconds}s)` : 'Retry'}
          </Button>
        )}
        {onDismiss && (
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}
