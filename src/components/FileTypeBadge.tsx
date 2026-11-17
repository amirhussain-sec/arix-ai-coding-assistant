import React from 'react';
import {getFileIconMeta} from '../lib/languages';
import {cn} from '../lib/utils';

export function FileTypeBadge({
  filename,
  className,
}: {
  filename: string;
  className?: string;
}) {
  const meta = getFileIconMeta(filename);
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold tracking-tight shrink-0',
        className
      )}
      style={{
        backgroundColor: `${meta.color}20`,
        color: meta.color,
        border: `1px solid ${meta.color}40`,
      }}
    >
      {meta.label}
    </span>
  );
}
