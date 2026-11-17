import React, {memo, useMemo, useState} from 'react';
import type {DailyUsagePoint} from '../lib/types';

interface UsageChartProps {
  data: DailyUsagePoint[];
}

export const UsageChart = memo(function UsageChart({data}: UsageChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const {total, maxVal} = useMemo(
    () => ({
      total: data.reduce((sum, d) => sum + d.count, 0),
      maxVal: Math.max(4, ...data.map((d) => d.count)),
    }),
    [data]
  );

  if (total === 0) {
    return (
      <div className="h-52 flex flex-col items-center justify-center text-center px-4">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          No AI requests recorded in the last 7 days
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
          Your daily AI activity across Chat, Agent, Generator, Debugger, and
          Explainer will chart here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-52 pt-6 pb-2 flex flex-col justify-between">
      <div className="flex-1 grid grid-cols-7 gap-2 sm:gap-3 items-end px-1">
        {data.map((point, idx) => {
          const heightPct = Math.max(
            point.count > 0 ? 12 : 4,
            Math.round((point.count / maxVal) * 100)
          );
          const isHovered = hoveredIndex === idx;

          return (
            <div
              key={point.date}
              className="h-full flex flex-col items-center justify-end gap-2 relative"
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {isHovered && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-md border border-slate-200 dark:border-slate-700 bg-slate-900 text-white px-2 py-0.5 text-[11px] font-mono tabular-nums shadow-md">
                  {point.date}: {point.count}
                </div>
              )}
              <div className="w-full flex-1 flex items-end justify-center">
                <div
                  className={`w-full max-w-[36px] rounded-t-lg transition-all duration-150 ${
                    point.count > 0
                      ? 'bg-gradient-to-t from-[#4f6bff] to-[#06b6d4] opacity-90 hover:opacity-100'
                      : 'bg-slate-200/70 dark:bg-slate-800/70'
                  }`}
                  style={{height: `${heightPct}%`}}
                />
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                {point.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
