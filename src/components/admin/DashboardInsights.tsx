import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  TrendingUp, TrendingDown, Clock, Users, AlertCircle, Building2,
  CheckCircle2, MessageSquare, GraduationCap, FileWarning, Activity, ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

type Insights = {
  learning_health: {
    week_minutes: number; prev_week_minutes: number;
    week_active: number; prev_week_active: number;
    completion_rate: number; total_enrollments: number; total_completions: number;
    stuck_courses: { id: string; title: string; stuck_count: number }[];
    heatmap: { dow: number; hr: number; n: number }[];
  };
  user_insights: {
    dau: number; wau: number; mau: number;
    new_users: number; returning_users: number; dormant: number;
    branches: { id: string; name: string; total: number; active: number; rate: number }[];
  };
  content_quality: {
    low_completion: { id: string; title: string; course_title: string; attempts: number; rate: number }[];
    assessment_pass_rate: number; assessment_attempts: number;
    low_pass_assessments: { id: string; title: string; attempts: number; pass_rate: number }[];
    top_commented: { id: string; title: string; comments: number }[];
  };
};

const pct = (curr: number, prev: number): number | null => {
  if (!prev) return curr > 0 ? 100 : null;
  return Math.round(((curr - prev) / prev) * 100);
};

const DeltaBadge = ({ value }: { value: number | null }) => {
  if (value === null) return null;
  const isUp = value >= 0;
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isUp ? "text-emerald-600" : "text-red-600"}`}>
      <Icon className="h-3 w-3" />{Math.abs(value)}%
    </span>
  );
};

const Section = ({ icon: Icon, title, subtitle, children }: any) => (
  <section className="space-y-3">
    <div className="flex items-baseline gap-2">
      <Icon className="h-4 w-4 text-muted-foreground self-center" />
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
    </div>
    {children}
  </section>
);

const StatBox = ({ label, value, suffix, delta }: { label: string; value: number | string; suffix?: string; delta?: number | null }) => (
  <div className="stat-card !p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <div className="mt-1.5 flex items-baseline gap-2">
      <span className="text-xl font-bold text-foreground">{value}</span>
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      {delta !== undefined && <DeltaBadge value={delta} />}
    </div>
  </div>
);

const Heatmap = ({ cells }: { cells: { dow: number; hr: number; n: number }[] }) => {
  const max = cells.reduce((m, c) => Math.max(m, c.n), 0) || 1;
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  cells.forEach((c) => { grid[c.dow][c.hr] = c.n; });
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return (
    <div className="w-full">
      <div className="grid w-full gap-1" style={{ gridTemplateColumns: "auto repeat(24, minmax(0, 1fr))" }}>
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="text-[10px] text-muted-foreground text-center">{h % 3 === 0 ? h : ""}</div>
        ))}
        {grid.map((row, d) => (
          <Fragment key={`r${d}`}>
            <div className="text-[11px] text-muted-foreground pr-2 text-right self-center">{days[d]}</div>
            {row.map((n, h) => {
              const intensity = n / max;
              const bg = n === 0 ? "hsl(var(--muted))" : `hsl(var(--primary) / ${0.15 + intensity * 0.85})`;
              return (
                <div
                  key={`${d}-${h}`}
                  title={`${days[d]} ${h}시: ${n}회`}
                  className="aspect-square w-full rounded-sm"
                  style={{ background: bg }}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
};

export default function DashboardInsights() {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.startsWith("en");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard-insights"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_dashboard_insights");
      if (error) throw error;
      return data as Insights;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  if (isLoading || !data) {
    return <Skeleton className="h-96 w-full rounded-lg" />;
  }

  const lh = data.learning_health;
  const ui = data.user_insights;
  const cq = data.content_quality;
  const hours = Math.round(lh.week_minutes / 60);
  const prevHours = Math.round(lh.prev_week_minutes / 60);
  const topBranches = [...ui.branches].sort((a, b) => b.rate - a.rate).slice(0, 5);
  const bottomBranches = [...ui.branches].sort((a, b) => a.rate - b.rate).slice(0, 5);

  return (
    <div className="space-y-8">
      {/* ── 학습 건강도 ── */}
      <Section icon={Activity} title={isEn ? "Learning Health" : "학습 건강도"} subtitle={isEn ? "Last 7 days" : "최근 7일"}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatBox
            label={isEn ? "Total learning time" : "이번 주 학습시간"}
            value={hours.toLocaleString()} suffix={isEn ? "hours" : "시간"}
            delta={pct(lh.week_minutes, lh.prev_week_minutes)}
          />
          <StatBox
            label={isEn ? "Active learners" : "주간 활성 학습자"}
            value={lh.week_active.toLocaleString()} suffix={isEn ? "users" : "명"}
            delta={pct(lh.week_active, lh.prev_week_active)}
          />
          <StatBox
            label={isEn ? "Completion rate" : "완강률"}
            value={`${lh.completion_rate}%`}
            suffix={`(${lh.total_completions}/${lh.total_enrollments})`}
          />
          <StatBox
            label={isEn ? "Prev week hours" : "지난 주 학습시간"}
            value={prevHours.toLocaleString()} suffix={isEn ? "hours" : "시간"}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* 이탈 강의 TOP 5 */}
          <div className="stat-card !p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                {isEn ? "Stuck Courses TOP 5" : "이탈 강의 TOP 5"}
              </h3>
              <span className="text-[10px] text-muted-foreground">{isEn ? "Progress <10%, >7 days" : "진도 10% 미만 · 7일+"}</span>
            </div>
            {lh.stuck_courses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{isEn ? "No stuck courses" : "이탈 강의 없음"}</p>
            ) : (
              <div className="space-y-2">
                {lh.stuck_courses.map((c, i) => (
                  <Link key={c.id} to={`/admin/courses`} className="flex items-center justify-between gap-3 py-2 border-b border-border/50 last:border-0 hover:bg-muted/40 -mx-2 px-2 rounded">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                      <span className="text-sm text-foreground truncate">{c.title}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs whitespace-nowrap">{c.stuck_count}{isEn ? "" : "명"}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* 시간대 히트맵 */}
          <div className="stat-card !p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                {isEn ? "Access Heatmap" : "접속 시간대 히트맵"}
              </h3>
              <span className="text-[10px] text-muted-foreground">{isEn ? "14d page views" : "최근 14일 페이지뷰"}</span>
            </div>
            <Heatmap cells={lh.heatmap} />
          </div>
        </div>
      </Section>

      {/* ── 사용자 인사이트 ── */}
      <Section icon={Users} title={isEn ? "User Insights" : "사용자 인사이트"}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatBox label="DAU" value={ui.dau.toLocaleString()} suffix={isEn ? "today" : "오늘"} />
          <StatBox label="WAU" value={ui.wau.toLocaleString()} suffix={isEn ? "7-day" : "7일"} />
          <StatBox label="MAU" value={ui.mau.toLocaleString()} suffix={isEn ? "30-day" : "30일"} />
          <StatBox label={isEn ? "Dormant (14d+)" : "휴면 위험"} value={ui.dormant.toLocaleString()} suffix={isEn ? "users" : "명"} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* 신규 vs 복귀 */}
          <div className="stat-card !p-5">
            <h3 className="text-sm font-semibold mb-3">{isEn ? "New vs Returning (7d)" : "신규 vs 복귀 (7일)"}</h3>
            {(() => {
              const total = ui.new_users + ui.returning_users || 1;
              const newPct = Math.round((ui.new_users / total) * 100);
              return (
                <>
                  <div className="h-3 w-full rounded-full overflow-hidden bg-muted flex">
                    <div className="h-full bg-primary" style={{ width: `${newPct}%` }} />
                    <div className="h-full bg-chart-3" style={{ width: `${100 - newPct}%` }} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 text-xs gap-2">
                    <div><span className="inline-block w-2 h-2 rounded-full bg-primary mr-1.5" />{isEn ? "New" : "신규"} <b className="ml-1">{ui.new_users}</b></div>
                    <div><span className="inline-block w-2 h-2 rounded-full bg-chart-3 mr-1.5" />{isEn ? "Returning" : "복귀"} <b className="ml-1">{ui.returning_users}</b></div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* 지점 참여율 TOP 5 */}
          <div className="stat-card !p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-emerald-600" />
              {isEn ? "Top Branches" : "지점 참여율 TOP 5"}
            </h3>
            <div className="space-y-2">
              {topBranches.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm truncate">{b.name}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap"><b className="text-emerald-600">{b.rate}%</b> ({b.active}/{b.total})</span>
                </div>
              ))}
            </div>
          </div>

          {/* 지점 참여율 BOTTOM 5 */}
          <div className="stat-card !p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-red-600" />
              {isEn ? "Needs Attention" : "지점 참여율 BOTTOM 5"}
            </h3>
            <div className="space-y-2">
              {bottomBranches.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm truncate">{b.name}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap"><b className="text-red-600">{b.rate}%</b> ({b.active}/{b.total})</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── 콘텐츠 품질 ── */}
      <Section icon={GraduationCap} title={isEn ? "Content Quality" : "콘텐츠 품질"}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* 평가 합격률 */}
          <div className="stat-card !p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {isEn ? "Assessment Pass Rate" : "평가 합격률"}
              </h3>
              <span className="text-[10px] text-muted-foreground">30{isEn ? "d" : "일"}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">{cq.assessment_pass_rate}%</span>
              <span className="text-xs text-muted-foreground">{cq.assessment_attempts}{isEn ? " attempts" : "건 응시"}</span>
            </div>
            <div className="mt-3 h-2 rounded-full overflow-hidden bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${cq.assessment_pass_rate}%` }} />
            </div>
            {cq.low_pass_assessments.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border/50">
                <p className="text-[11px] text-muted-foreground mb-2">{isEn ? "Low pass-rate quizzes" : "합격률 낮은 평가"}</p>
                <div className="space-y-1.5">
                  {cq.low_pass_assessments.slice(0, 3).map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-xs">
                      <span className="truncate">{a.title}</span>
                      <span className="text-red-600 font-medium whitespace-nowrap ml-2">{a.pass_rate}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 차시별 완료율 낮은 TOP 5 */}
          <div className="stat-card !p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <FileWarning className="h-4 w-4 text-amber-600" />
              {isEn ? "Low Completion Lessons" : "완료율 낮은 차시 TOP 5"}
            </h3>
            {cq.low_completion.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{isEn ? "All lessons performing well" : "모든 차시 양호"}</p>
            ) : (
              <div className="space-y-2">
                {cq.low_completion.map((c, i) => (
                  <div key={c.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{i + 1}.</span>
                      <span className="text-sm flex-1 truncate">{c.title}</span>
                      <span className="text-xs font-medium text-amber-600 whitespace-nowrap">{c.rate}%</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground pl-4 truncate">{c.course_title} · {c.attempts}{isEn ? " attempts" : "회"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 댓글 활발 강의 */}
          <div className="stat-card !p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-chart-3" />
                {isEn ? "Most Discussed" : "댓글 활발 강의"}
              </h3>
              <Link to="/admin/courses" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center">
                {isEn ? "All" : "전체"} <ArrowRight className="h-3 w-3 ml-0.5" />
              </Link>
            </div>
            {cq.top_commented.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{isEn ? "No recent comments" : "최근 댓글 없음"}</p>
            ) : (
              <div className="space-y-2">
                {cq.top_commented.map((c, i) => (
                  <div key={c.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                      <span className="text-sm truncate">{c.title}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs whitespace-nowrap">{c.comments}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
