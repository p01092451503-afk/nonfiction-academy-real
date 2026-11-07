import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  GraduationCap,
  Home,
  ClipboardCheck,
  Target,
  BarChart3,
  Users,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import MyGrowthAssignments from './MyGrowthAssignments';
import MyGrowthRecords from './MyGrowthRecords';
import MyGrowthTraining from './MyGrowthTraining';
import MyGrowthLearning from './MyGrowthLearning';
import MyGrowthPlans from './MyGrowthPlans';

/**
 * My Growth 화면 골격 (격리 개발 단계).
 *
 * - 이 초안의 예시 자료와 검수용 서버 함수만 사용합니다.
 * - 기존 이러닝 메뉴에는 항목을 추가하지 않습니다. /my-growth 주소로만 들어오며,
 *   접근 허용 여부는 MyGrowthBoundary가 서버 검증 기반으로 판단합니다.
 * - 격리 검증이 통과하기 전까지 경계는 닫혀 있어 어떤 계정도 이 화면을 볼 수
 *   없습니다.
 */

const NAV_ITEMS = [
  { to: '/my-growth', end: true, icon: Home, label: '성장 홈' },
  { to: '/my-growth/learning', end: false, icon: GraduationCap, label: '나의 학습 목록' },
  { to: '/my-growth/records', end: false, icon: ClipboardCheck, label: '성장 기록' },
  { to: '/my-growth/training', end: false, icon: GraduationCap, label: '오프라인 교육' },
  { to: '/my-growth/coaching', end: false, icon: Users, label: '필드 코칭' },
  { to: '/my-growth/manager-coaching', end: false, icon: Users, label: '매니저 코칭' },
  { to: '/my-growth/plans', end: false, icon: Target, label: '실행 계획·후속 확인' },
  { to: '/my-growth/reports', end: false, icon: BarChart3, label: '보고' },
  { to: '/my-growth/assignments', end: false, icon: Users, label: '담당자·담당 범위' },
] as const;

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b-2 border-border/80 pb-4">
      <h1 className="text-xl sm:text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}

function ExampleBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
      예시 화면
    </span>
  );
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  training: '오프라인 교육',
  coaching: '코칭',
  plan: '실행 계획',
  followup: '후속 확인',
};

const STATUS_LABEL: Record<string, string> = {
  done: '완료',
  in_progress: '진행 중',
  scheduled: '예정',
};

interface GrowthEvent {
  id: string;
  event_type: string;
  title: string;
  detail: string | null;
  occurred_on: string;
  status: string;
}

function GrowthHome() {
  const { user } = useUser();
  const { data: events, isLoading } = useQuery({
    queryKey: ['mygrowth-events', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<GrowthEvent[]> => {
      const { data, error } = await supabase
        .from('mygrowth_events')
        .select('id, event_type, title, detail, occurred_on, status')
        .order('occurred_on', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const now = new Date();
  const thisMonth = (e: GrowthEvent) => {
    const d = new Date(e.occurred_on);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };
  const list = events ?? [];
  const cards = [
    { label: '이번 달 이수한 교육', value: list.filter((e) => e.event_type === 'training' && e.status === 'done' && thisMonth(e)).length },
    { label: '진행 중인 실행 계획', value: list.filter((e) => e.event_type === 'plan' && e.status === 'in_progress').length },
    { label: '받은 코칭 기록', value: list.filter((e) => e.event_type === 'coaching' && e.status === 'done').length },
    { label: '후속 확인 예정', value: list.filter((e) => e.event_type === 'followup' && e.status === 'scheduled').length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="성장 홈"
        subtitle="나의 교육·코칭·실행 계획을 한곳에서 확인합니다."
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="text-2xl font-semibold mt-2">
              {isLoading ? '…' : `${c.value}건`}
            </p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">최근 활동</h2>
        </div>
        {isLoading ? (
          <p className="py-6 text-sm text-muted-foreground">불러오는 중입니다.</p>
        ) : list.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            아직 기록된 활동이 없습니다. 교육이나 코칭이 등록되면 여기에 보입니다.
          </p>
        ) : (
          <ul className="divide-y divide-border/80 text-sm">
            {list.slice(0, 5).map((e) => (
              <li key={e.id} className="py-3 flex justify-between gap-4">
                <span className="min-w-0">
                  <span className="text-muted-foreground mr-2">[{EVENT_TYPE_LABEL[e.event_type] ?? e.event_type}]</span>
                  {e.title}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {e.occurred_on} · {STATUS_LABEL[e.status] ?? e.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Reports() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="보고"
        subtitle="지점·개인별 성장 현황을 모아 보고 내려받습니다."
      />
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground space-y-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4" />
          <span>보고 항목과 내려받기 형식은 고객 확인 후 확정합니다.</span>
        </div>
        <ExampleBadge />
      </div>
    </div>
  );
}

export default function MyGrowthScaffold() {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-w-0 min-h-screen">
        <aside className="w-56 shrink-0 border-r border-border/80 bg-card hidden sm:flex sm:flex-col">
          <div className="px-4 py-5 border-b-2 border-border/80">
            <p className="font-semibold">My Growth</p>
            <p className="text-xs text-muted-foreground mt-1">격리 개발 미리보기</p>
          </div>
          <nav className="flex-1 p-2 space-y-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="flex-1 min-w-0 p-4 sm:p-8">
          <div className="sm:hidden mb-4 flex gap-2 overflow-x-auto">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `shrink-0 rounded-full border px-3 py-1.5 text-sm ${
                    isActive
                      ? 'border-accent bg-accent text-accent-foreground'
                      : 'border-border text-muted-foreground'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
          <Routes>
            <Route index element={<GrowthHome />} />
            <Route path="learning" element={<MyGrowthLearning />} />
            <Route path="records" element={<MyGrowthRecords />} />
            <Route path="training" element={<MyGrowthTraining />} />
            <Route path="coaching" element={<MyGrowthTraining key="field" coaching />} />
            <Route path="manager-coaching" element={<MyGrowthTraining key="manager" manager />} />
            <Route path="plans" element={<MyGrowthPlans />} />
            <Route path="reports" element={<Reports />} />
            <Route path="assignments" element={<MyGrowthAssignments />} />
            <Route path="*" element={<Navigate to="/my-growth" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
