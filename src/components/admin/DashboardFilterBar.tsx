import { useMemo } from "react";
import { Filter, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { MultiSelectPopover } from "@/components/ui/MultiSelectPopover";
import { useLeaderScope } from "@/hooks/useLeaderScope";

export interface DashboardFilters {
  years: number[];
  months: number[];
  countries: string[];
  branch_ids: string[];
}

interface DashboardFilterBarProps {
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
  leaderId?: string;
  role?: "admin" | "teacher" | "dept_admin";
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => ({
  id: String(CURRENT_YEAR - i),
  label: String(CURRENT_YEAR - i),
}));

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  id: String(i + 1),
  label: String(i + 1),
}));

export const DashboardFilterBar = ({
  filters,
  onChange,
  leaderId,
  role = "admin",
}: DashboardFilterBarProps) => {
  const { t } = useTranslation();
  const { scopeIds, isLoading: scopeLoading } = useLeaderScope();

  const isLeader = role === "teacher" || role === "dept_admin";

  const { data: branches = [] } = useQuery({
    queryKey: ["dashboard-filter-branches", isLeader ? scopeIds : null],
    enabled: !isLeader || scopeIds.length > 0,
    queryFn: async () => {
      let q = supabase
        .from("departments")
        .select("id, name, name_en, code, country, parent_department_id")
        .order("name", { ascending: true });

      if (isLeader && scopeIds.length > 0) {
        q = q.in("id", scopeIds);
      } else {
        q = q.is("parent_department_id", null);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const countryOptions = useMemo(() => {
    const countries = new Set<string>();
    branches.forEach((b: any) => {
      if (b.country) countries.add(b.country);
    });
    return Array.from(countries)
      .sort()
      .map((c) => ({ id: c, label: c }));
  }, [branches]);

  const branchOptions = useMemo(
    () =>
      branches.map((b: any) => ({
        id: b.id,
        label: b.name,
        sub: b.country ? `${b.country}${b.code ? ` · ${b.code}` : ""}` : undefined,
      })),
    [branches]
  );

  const activeFilterCount =
    filters.years.length +
    filters.months.length +
    filters.countries.length +
    filters.branch_ids.length;

  const clearAll = () =>
    onChange({ years: [], months: [], countries: [], branch_ids: [] });

  const update = (key: keyof DashboardFilters, value: string[]) => {
    // For numeric arrays, convert strings to numbers
    if (key === "years" || key === "months") {
      onChange({ ...filters, [key]: value.map((v) => Number(v)) });
    } else {
      onChange({ ...filters, [key]: value });
    }
  };

  if (scopeLoading) {
    return (
      <div className="flex items-center gap-2 h-9 text-xs text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground mr-1">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span>{t("common.filter")}</span>
        </div>

        <MultiSelectPopover
          label={t("dashboard.filter.year", { defaultValue: "년도" })}
          placeholder={t("dashboard.filter.selectYear", { defaultValue: "년도 선택" })}
          options={YEAR_OPTIONS}
          selected={filters.years.map(String)}
          onChange={(v) => update("years", v)}
          width="w-[200px]"
        />

        <MultiSelectPopover
          label={t("dashboard.filter.month", { defaultValue: "월" })}
          placeholder={t("dashboard.filter.selectMonth", { defaultValue: "월 선택" })}
          options={MONTH_OPTIONS}
          selected={filters.months.map(String)}
          onChange={(v) => update("months", v)}
          width="w-[200px]"
        />

        <MultiSelectPopover
          label={t("dashboard.filter.country", { defaultValue: "국가" })}
          placeholder={t("dashboard.filter.selectCountry", { defaultValue: "국가 선택" })}
          options={countryOptions}
          selected={filters.countries}
          onChange={(v) => update("countries", v)}
          width="w-[220px]"
        />

        <MultiSelectPopover
          label={t("dashboard.filter.branch", { defaultValue: "매장" })}
          placeholder={t("dashboard.filter.selectBranch", { defaultValue: "매장 선택" })}
          options={branchOptions}
          selected={filters.branch_ids}
          onChange={(v) => update("branch_ids", v)}
          width="w-[280px]"
        />

        {activeFilterCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-9 text-xs text-muted-foreground hover:text-destructive gap-1"
          >
            <RotateCcw className="h-3 w-3" />
            {t("dashboard.filter.clear", { defaultValue: "초기화" })}
            <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-muted px-1 text-[10px]">
              {activeFilterCount}
            </span>
          </Button>
        )}
      </div>

      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.years.map((y) => (
            <FilterBadge
              key={`y-${y}`}
              label={`${y}${t("dashboard.filter.yearSuffix", { defaultValue: "년" })}`}
              onRemove={() => update("years", filters.years.filter((x) => x !== y).map(String))}
            />
          ))}
          {filters.months.map((m) => (
            <FilterBadge
              key={`m-${m}`}
              label={`${m}${t("dashboard.filter.monthSuffix", { defaultValue: "월" })}`}
              onRemove={() => update("months", filters.months.filter((x) => x !== m).map(String))}
            />
          ))}
          {filters.countries.map((c) => (
            <FilterBadge
              key={`c-${c}`}
              label={c}
              onRemove={() => update("countries", filters.countries.filter((x) => x !== c))}
            />
          ))}
          {filters.branch_ids.map((id) => {
            const branch = branches.find((b: any) => b.id === id);
            return (
              <FilterBadge
                key={`b-${id}`}
                label={branch?.name || id}
                onRemove={() => update("branch_ids", filters.branch_ids.filter((x) => x !== id))}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

const FilterBadge = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
    {label}
    <button
      type="button"
      onClick={onRemove}
      className="rounded-full p-0.5 hover:bg-primary/20"
      aria-label="remove filter"
    >
      <X className="h-3 w-3" />
    </button>
  </span>
);

export default DashboardFilterBar;
