import { TooltipProps } from "recharts";

/**
 * 통일된 차트 호버 툴팁
 * - Toss/Nonfiction 미니멀 무드
 * - 흰 배경 / 얇은 보더 / 부드러운 그림자 / 작은 라운드
 * - 색상 점 + 라벨 + 값
 */
export interface ChartTooltipFormatterContext {
  name?: string | number;
  dataKey?: string | number;
}

interface ChartTooltipContentProps extends TooltipProps<number | string, string> {
  /** 값 포매터: 표시할 문자열 반환. 반환이 없으면 기본 toLocaleString. */
  valueFormatter?: (
    value: number | string,
    ctx: ChartTooltipFormatterContext,
  ) => string | number;
  /** 라벨(보통 X축 값) 포매터 */
  labelFormatter?: (label: unknown) => string;
  /** 단위 접미사 (예: "%", "GB") — valueFormatter 미지정 시 사용 */
  unit?: string;
  /** 라벨 숨김 */
  hideLabel?: boolean;
}

const defaultFormat = (v: number | string, unit?: string) => {
  if (typeof v === "number") {
    const formatted = Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 3 });
    return unit ? `${formatted}${unit}` : formatted;
  }
  return unit ? `${v}${unit}` : String(v);
};

export const ChartTooltipContent = ({
  active,
  payload,
  label,
  valueFormatter,
  labelFormatter,
  unit,
  hideLabel,
}: ChartTooltipContentProps) => {
  if (!active || !payload || payload.length === 0) return null;

  const labelText = labelFormatter ? labelFormatter(label) : (label as string);

  return (
    <div className="rounded-lg border border-border/80 bg-background/95 backdrop-blur-sm px-3 py-2 shadow-lg shadow-black/5 min-w-[120px]">
      {!hideLabel && labelText !== undefined && labelText !== "" && (
        <div className="text-[11px] font-medium text-muted-foreground mb-1.5 tracking-tight">
          {labelText}
        </div>
      )}
      <div className="space-y-1">
        {payload.map((entry, idx) => {
          const color = (entry.color || (entry.payload as any)?.fill) as string | undefined;
          const value =
            valueFormatter && entry.value !== undefined
              ? valueFormatter(entry.value as number | string, {
                  name: entry.name,
                  dataKey: entry.dataKey as string | number | undefined,
                })
              : defaultFormat(entry.value as number | string, unit);
          return (
            <div key={`${entry.dataKey}-${idx}`} className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span className="text-muted-foreground truncate">{entry.name}</span>
              </div>
              <span className="font-semibold text-foreground tabular-nums">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Recharts <Tooltip /> 에 바로 넣을 수 있는 공용 props */
export const chartTooltipDefaults = {
  cursor: { fill: "hsl(var(--muted) / 0.4)" },
  wrapperStyle: { outline: "none" },
} as const;

/** 라인/에어리어 차트용 cursor (세로선) */
export const chartLineCursor = {
  stroke: "hsl(var(--border))",
  strokeWidth: 1,
  strokeDasharray: "3 3",
};
