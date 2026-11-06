import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import {
  GraduationCap,
  Home,
  ClipboardCheck,
  Target,
  BarChart3,
  Users,
} from 'lucide-react';

/**
 * My Growth 화면 골격 (격리 개발 단계).
 *
 * - 이 파일의 모든 내용은 예시(합성) 데이터만 사용하며, 어떤 저장소·서버 기능·외부
 *   서비스에도 접근하지 않습니다.
 * - 기존 이러닝 메뉴에는 항목을 추가하지 않습니다. /my-growth 주소로만 들어오며,
 *   접근 허용 여부는 MyGrowthBoundary가 서버 검증 기반으로 판단합니다.
 * - 격리 검증이 통과하기 전까지 경계는 닫혀 있어 어떤 계정도 이 화면을 볼 수
 *   없습니다.
 */

const NAV_ITEMS = [
  { to: '/my-growth', end: true, icon: Home, label: '성장 홈' },
  { to: '/my-growth/training', end: false, icon: GraduationCap, label: '오프라인 교육' },
  { to: '/my-growth/coaching', end: false, icon: Users, label: '필드·매니저 코칭' },
  { to: '/my-growth/plans', end: false, icon: Target, label: '실행 계획·후속 확인' },
  { to: '/my-growth/reports', end: false, icon: BarChart3, label: '보고' },
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

function GrowthHome() {
  const cards = [
    { label: '이번 달 이수한 교육', value: '2건' },
    { label: '진행 중인 실행 계획', value: '1건' },
    { label: '받은 코칭 기록', value: '3건' },
    { label: '후속 확인 예정', value: '1건' },
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
            <p className="text-2xl font-semibold mt-2">{c.value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">최근 활동</h2>
          <ExampleBadge />
        </div>
        <ul className="divide-y divide-border/80 text-sm">
          <li className="py-3 flex justify-between gap-4">
            <span>신제품 향수 교육 이수</span>
            <span className="text-muted-foreground shrink-0">예시</span>
          </li>
          <li className="py-3 flex justify-between gap-4">
            <span>매니저 코칭 세션 완료</span>
            <span className="text-muted-foreground shrink-0">예시</span>
          </li>
          <li className="py-3 flex justify-between gap-4">
            <span>실행 계획 1주차 후속 확인 대기</span>
            <span className="text-muted-foreground shrink-0">예시</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function Training() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="오프라인 교육"
        subtitle="대면 교육 일정 등록, 참석 확인, 교육 자료를 관리합니다."
      />
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">예정된 교육</h2>
          <ExampleBadge />
        </div>
        <ul className="divide-y divide-border/80 text-sm">
          <li className="py-3 flex justify-between gap-4">
            <span>링크 셀링 & 센트 큐레이션 집체 교육</span>
            <span className="text-muted-foreground shrink-0">예시</span>
          </li>
          <li className="py-3 flex justify-between gap-4">
            <span>신입 직원 오리엔테이션</span>
            <span className="text-muted-foreground shrink-0">예시</span>
          </li>
        </ul>
      </div>
      <p className="text-sm text-muted-foreground">
        참석 직원의 이수 기록은 기존 학습 이력과 읽기 전용으로 연결될 예정입니다.
      </p>
    </div>
  );
}

function Coaching() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="필드·매니저 코칭"
        subtitle="현장 코칭과 매니저 코칭 세션을 기록하고 확인합니다."
      />
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">코칭 기록</h2>
          <ExampleBadge />
        </div>
        <ul className="divide-y divide-border/80 text-sm">
          <li className="py-3 flex justify-between gap-4">
            <span>고객 응대 시연 피드백</span>
            <span className="text-muted-foreground shrink-0">예시</span>
          </li>
          <li className="py-3 flex justify-between gap-4">
            <span>월간 1:1 매니저 코칭</span>
            <span className="text-muted-foreground shrink-0">예시</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function Plans() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="실행 계획·후속 확인"
        subtitle="교육 후 현장 적용 계획을 세우고 후속 확인을 진행합니다."
      />
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">진행 중인 계획</h2>
          <ExampleBadge />
        </div>
        <ul className="divide-y divide-border/80 text-sm">
          <li className="py-3 flex justify-between gap-4">
            <span>시향 서비스 적용 계획 (1주차)</span>
            <span className="text-muted-foreground shrink-0">예시</span>
          </li>
        </ul>
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
      <div className="flex min-h-screen">
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
            <Route path="training" element={<Training />} />
            <Route path="coaching" element={<Coaching />} />
            <Route path="plans" element={<Plans />} />
            <Route path="reports" element={<Reports />} />
            <Route path="*" element={<Navigate to="/my-growth" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
