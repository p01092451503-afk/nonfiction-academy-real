import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';

/**
 * 기능 03: 공통 성장 기록과 이러닝 참고 조회.
 *
 * - 공통 기록(mygrowth_records)과 이러닝 참고(수강 원본 읽기 전용)를 한 화면에 보여 줍니다.
 * - 이러닝 값은 기존 원본을 읽기만 하며 어떤 것도 다시 쓰지 않습니다.
 * - 조회는 서버 기능이 지정 검수자 본인 기록만 반환하도록 제한되어 있습니다.
 */

const TYPE_LABEL: Record<string, string> = {
  offline_training: '오프라인 교육',
  elearning: '이러닝',
  field_coaching: '필드 코칭',
  manager_coaching: '매니저 코칭',
};

const STATUS_LABEL: Record<string, string> = {
  done: '완료',
  in_progress: '진행 중',
  scheduled: '예정',
};

interface FeedRow {
  feed_key: string;
  record_type: string;
  title: string;
  detail: string | null;
  occurred_on: string;
  status: string;
  planned_minutes: number | null;
  actual_minutes: number | null;
  branch_name: string | null;
  progress: number | null;
  completion_count: number | null;
}

interface ElearningRow {
  enrollment_id: string;
  course_title: string;
  enrolled_at: string;
  completed_at: string | null;
  progress: number;
  completion_count: number;
  status: string;
}

function minutesLabel(minutes: number | null) {
  if (minutes === null || minutes === undefined) return '-';
  return `${minutes}분`;
}

export default function MyGrowthRecords() {
  const { user } = useUser();

  const { data: feed, isLoading: feedLoading } = useQuery({
    queryKey: ['mygrowth-record-feed', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<FeedRow[]> => {
      const { data, error } = await supabase.rpc('mygrowth_record_feed', {});
      if (error) throw error;
      return (data ?? []) as FeedRow[];
    },
  });

  const { data: elearning, isLoading: elearningLoading } = useQuery({
    queryKey: ['mygrowth-elearning-reference', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<ElearningRow[]> => {
      const { data, error } = await supabase.rpc('mygrowth_elearning_reference');
      if (error) throw error;
      return (data ?? []) as ElearningRow[];
    },
  });

  const rows = feed ?? [];
  const elearningRows = elearning ?? [];

  return (
    <div className="space-y-6">
      <div className="border-b-2 border-border/80 pb-4">
        <h1 className="text-xl sm:text-2xl font-semibold">성장 기록</h1>
        <p className="text-muted-foreground mt-1">
          교육·코칭 기록과 이러닝 학습 이력을 한곳에서 확인합니다.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="font-semibold">통합 기록</h2>
        {feedLoading ? (
          <p className="py-6 text-sm text-muted-foreground">불러오는 중입니다.</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            아직 기록이 없습니다. 교육이나 코칭이 등록되면 여기에 보입니다.
          </p>
        ) : (
          <ul className="divide-y divide-border/80 text-sm">
            {rows.map((r) => (
              <li key={r.feed_key} className="py-3 flex justify-between gap-4">
                <span className="min-w-0">
                  <span className="text-muted-foreground mr-2">
                    [{TYPE_LABEL[r.record_type] ?? r.record_type}]
                  </span>
                  {r.title}
                  {r.branch_name && (
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {r.branch_name}
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground shrink-0 text-right">
                  <span className="block">
                    {r.occurred_on} · {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  {(r.planned_minutes !== null || r.actual_minutes !== null) && (
                    <span className="block text-xs mt-0.5">
                      계획 {minutesLabel(r.planned_minutes)} · 실제 {minutesLabel(r.actual_minutes)}
                    </span>
                  )}
                  {r.record_type === 'elearning' && r.progress !== null && (
                    <span className="block text-xs mt-0.5">
                      진도 {Math.round(r.progress)}%
                      {r.completion_count ? ` · 수료 ${r.completion_count}회` : ''}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">이러닝 학습 이력</h2>
          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
            읽기 전용
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          기존 학습 기록 원본을 참고만 합니다. 여기서 값을 바꾸지 않습니다.
        </p>
        {elearningLoading ? (
          <p className="py-6 text-sm text-muted-foreground">불러오는 중입니다.</p>
        ) : elearningRows.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">수강 중인 강의가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border/80 text-sm">
            {elearningRows.map((e) => (
              <li key={e.enrollment_id} className="py-3 flex justify-between gap-4">
                <span className="min-w-0">{e.course_title}</span>
                <span className="text-muted-foreground shrink-0 text-right">
                  <span className="block">
                    진도 {Math.round(e.progress)}%
                    {e.completed_at ? ' · 수료' : ' · 진행 중'}
                  </span>
                  {e.completion_count > 0 && (
                    <span className="block text-xs mt-0.5">수료 {e.completion_count}회</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
