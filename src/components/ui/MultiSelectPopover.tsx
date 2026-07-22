import { useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface MultiSelectOption {
  id: string;
  label: string;
  sub?: string;
}

interface MultiSelectPopoverProps {
  label: string;
  placeholder: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  width?: string;
  selectAllText?: string;
  clearText?: string;
  emptyText?: string;
}

export const MultiSelectPopover = ({
  label,
  placeholder,
  options,
  selected,
  onChange,
  width = "w-[260px]",
  selectAllText = "전체 선택",
  clearText = "초기화",
  emptyText = "결과 없음",
}: MultiSelectPopoverProps) => {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sub || "").toLowerCase().includes(q)
    );
  }, [options, query]);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const allOnPageIds = filtered.map((o) => o.id);
  const allSelectedOnPage =
    allOnPageIds.length > 0 && allOnPageIds.every((id) => selected.includes(id));

  const toggleAll = () => {
    if (allSelectedOnPage) {
      onChange(selected.filter((id) => !allOnPageIds.includes(id)));
    } else {
      onChange(Array.from(new Set([...selected, ...allOnPageIds])));
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 justify-between gap-2 text-xs min-w-[140px]"
        >
          <span className="truncate">
            {selected.length > 0 ? `${label}: ${selected.length}` : placeholder}
          </span>
          <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={`${width} p-0`} align="start">
        <div className="p-2 border-b border-border">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="h-8 text-xs"
          />
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border text-[11px]">
          <button
            type="button"
            onClick={toggleAll}
            className="text-muted-foreground hover:text-foreground"
          >
            {allSelectedOnPage ? `${selectAllText} 해제` : selectAllText}
          </button>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
            >
              {clearText} <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="max-h-[320px] overflow-y-auto overscroll-contain p-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 text-center">{emptyText}</p>
          ) : (
            filtered.map((o) => (
              <label
                key={o.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-xs"
              >
                <Checkbox
                  checked={selected.includes(o.id)}
                  onCheckedChange={() => toggle(o.id)}
                />
                <span className="flex-1 truncate">{o.label}</span>
                {o.sub && (
                  <span className="text-[10px] text-muted-foreground shrink-0">{o.sub}</span>
                )}
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default MultiSelectPopover;
