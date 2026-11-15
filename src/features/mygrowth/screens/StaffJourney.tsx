import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Users, Search, ChevronRight, CalendarDays, BookOpen, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Header, QueryState, YearSelect, TypeIcon, PendingNotice } from './Shared';
import { yearRows } from './data';
import { useStaffDirectory, useStaffFeed, attendanceLabel, completedAttendance } from './staffData';
import PlanFollowup from '../components/PlanFollowup';

const root = '/my-growth/workspace/staff';
export default function StaffDirectory() {
  const query = useStaffDirectory(); const [params, setParams] = useSearchParams(); const search = params.get('search') ?? '';
  const people = query.isError ? [] : (query.data ?? []).filter(p => p.full_name.includes(search));
  return <section className="min-w-0 space-y-6"><Header title="직원 관리"/><p className="text-sm text-muted-foreground">담당 교육·코칭 대상 직원</p>
    <div className="relative min-w-0 max-w-sm"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input aria-label="직원 이름 검색" placeholder="직원 이름 검색" className="pl-9" value={search} onChange={e => setParams({ search: e.target.value })}/></div>
    <QueryState query={query}>{people.length ? <ul>{people.map(p => <li key={p.user_id} className="border-b-2 border-border/80"><Button asChild variant="ghost" className="h-auto w-full min-w-0 justify-start whitespace-normal px-2 py-5"><Link to={`${root}/${p.user_id}`}><Users className="h-5 w-5 shrink-0 text-muted-foreground"/><div className="min-w-0 flex-1 text-left"><h2 className="font-semibold break-words">{p.full_name}</h2><p className="mt-1 text-sm text-muted-foreground">{p.branch_name}</p></div><ChevronRight className="h-4 w-4 shrink-0"/></Link></Button></li>)}</ul> : <p className="py-8 text-muted-foreground">조회 가능한 직원이 없습니다.</p>}</QueryState>
    <PendingNotice title="고객 확인 대기" text="지점 전체 직원의 성장 기록과 다른 담당자의 민감한 코칭을 공개하는 범위는 확정되지 않았습니다."/>
  </section>;
}
export function StaffJourney() {
  const { employee } = useParams(); const directory = useStaffDirectory(); const query = useStaffFeed(employee); const [params, setParams] = useSearchParams();
  const year = params.get('year') ?? String(new Date().getFullYear()); const month = params.get('month') ?? 'all'; const kind = params.get('kind') ?? 'all';
  const person = directory.isError ? undefined : directory.data?.find(p => p.user_id === employee);
  const rows = query.isError ? [] : query.data ?? []; const yearly = yearRows(rows, year); const completed = completedAttendance(yearly);
  const filtered = yearly.filter(r => (month === 'all' || r.occurred_on.slice(5, 7) === month) && (kind === 'all' || (kind === 'learning' ? r.record_type === 'offline_training' : r.record_type.endsWith('_coaching'))));
  const update = (key: string, value: string) => setParams(p => { p.set(key, value); return p; });
  return <section className="min-w-0 space-y-6"><Header title="직원 성장 여정" back={root}/><QueryState query={directory}>{person && <div className="flex min-w-0 items-center gap-3"><Users className="h-6 w-6 shrink-0 text-muted-foreground"/><div className="min-w-0"><h2 className="text-xl font-semibold break-words">{person.full_name}</h2><p className="mt-1 text-sm text-muted-foreground">{person.branch_name}</p></div></div>}</QueryState>
    <QueryState query={query}><div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><CalendarDays className="h-5 w-5"/>{year}년 성장 이력</h2><YearSelect rows={rows} value={year} onChange={v => { setParams({ year: v }); }}/></div>
      <dl className="grid grid-cols-3 gap-3 border-b-2 border-border/80 pb-5"><div><dd className="text-2xl font-semibold">{completed.length}</dd><dt className="text-sm text-muted-foreground">참석 기록</dt></div><div><dd className="text-2xl font-semibold">{completed.filter(r => r.record_type === 'offline_training').length}</dd><dt className="text-sm text-muted-foreground">교육</dt></div><div><dd className="text-2xl font-semibold">{completed.filter(r => r.record_type.endsWith('_coaching')).length}</dd><dt className="text-sm text-muted-foreground">코칭</dt></div></dl>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">{Array.from({ length: 12 }, (_, i) => { const m = String(i + 1).padStart(2, '0'); return <Button key={m} variant={month === m ? 'secondary' : 'ghost'} className="h-16 min-w-0 flex-col gap-1" aria-pressed={month === m} aria-label={`${i + 1}월 성장 기록`} onClick={() => update('month', m)}><span>{i + 1}월</span><span className="text-xs text-muted-foreground">{completed.filter(r => r.occurred_on.slice(5, 7) === m).length}건</span></Button>; })}</div>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><Tabs value={kind} onValueChange={v => update('kind', v)}><TabsList><TabsTrigger value="all">전체</TabsTrigger><TabsTrigger value="learning"><BookOpen className="mr-1 h-4 w-4"/>학습</TabsTrigger><TabsTrigger value="coaching"><MessageCircle className="mr-1 h-4 w-4"/>코칭</TabsTrigger></TabsList></Tabs><Button variant="ghost" onClick={() => update('month', 'all')}>모든 달</Button></div>
      {filtered.length ? <ul>{filtered.map(r => <li key={r.feed_key} className="border-b-2 border-border/80"><Button asChild variant="ghost" className="h-auto w-full min-w-0 justify-start whitespace-normal px-2 py-5"><Link to={`${root}/${employee}/detail/${r.training_id}?${params.toString()}`}><TypeIcon type={r.record_type}/><div className="min-w-0 flex-1 text-left"><span className="text-xs text-muted-foreground">{r.occurred_on} · {attendanceLabel(r)}</span><h3 className="mt-1 font-semibold break-words">{r.title}</h3><p className="mt-1 text-xs text-muted-foreground">{r.trainer_name}</p></div><ChevronRight className="h-4 w-4 shrink-0"/></Link></Button></li>)}</ul> : <p className="py-10 text-muted-foreground">이 기간에 조회 가능한 기록이 없습니다.</p>}
    </QueryState><PendingNotice title="고객 확인 대기" text="이 화면은 허용된 교육·코칭 기록만 포함합니다. 직원 전체 학습·팀 공개 및 보고 집계 범위는 확정 전입니다."/>
  </section>;
}
export function StaffRecordDetail() {
  const { employee, training } = useParams(); const [params] = useSearchParams(); const query = useStaffFeed(employee, training); const row = query.isError ? undefined : query.data?.[0];
  return <section className="min-w-0 space-y-6"><Header title="직원 학습·코칭 상세" back={`${root}/${employee}?${params.toString()}`}/><QueryState query={query}>{row && <><div className="flex min-w-0 gap-3"><TypeIcon type={row.record_type}/><div className="min-w-0"><h2 className="text-xl font-semibold break-words">{row.title}</h2><p className="mt-2 text-sm text-muted-foreground">{row.occurred_on} · {attendanceLabel(row)}</p></div></div><dl className="grid gap-4 border-b-2 border-border/80 pb-6 sm:grid-cols-2">{[['지점', row.branch_name], ['담당자', row.trainer_name], ['장소', row.location], ['계획 시간', row.planned_minutes === null ? null : `${row.planned_minutes}분`], ['실제 시간', row.actual_minutes === null ? null : `${row.actual_minutes}분`]].map(([label, value]) => <div className="min-w-0" key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value ?? '미기록'}</dd></div>)}</dl>{[['핵심 정리', row.detail], ['현장 관찰', row.observation], ['담당자 피드백', row.feedback], ['다음 실행', row.next_action], ['직원 실행 계획', row.plan_body]].filter(([, value]) => value).map(([label, value]) => <section key={label} className="min-w-0 space-y-2"><h3 className="font-semibold">{label}</h3><p className="text-sm whitespace-pre-wrap break-words">{value}</p></section>)}{row.plan_id && <PlanFollowup planId={row.plan_id}/>}</>}</QueryState></section>;
}