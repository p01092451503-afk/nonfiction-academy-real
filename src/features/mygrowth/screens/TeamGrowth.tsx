import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { UsersRound, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QueryState, PendingNotice } from './Shared';
import { useCapabilities } from './data';
import { teamRowSchema, branchSchema, planLabel, teamTotals } from './teamData';

const ALL = 'all';
export default function TeamGrowth() {
  const { user } = useUser(); const caps = useCapabilities(); const edu = Boolean(caps.data?.can_appoint);
  const [branch, setBranch] = useState(ALL);
  const branches = useQuery({ queryKey: ['mygrowth-team-branches', user?.id], enabled: Boolean(user?.id) && edu, staleTime: 0, gcTime: 0, retry: false,
    queryFn: async () => { const { data, error } = await supabase.rpc('mygrowth_team_branches'); if (error) throw error; return branchSchema.parse(data); } });
  const q = useQuery({ queryKey: ['mygrowth-team-summary', user?.id, edu, branch], enabled: Boolean(user?.id) && caps.isSuccess, staleTime: 0, gcTime: 0, retry: false, refetchInterval: 15000,
    queryFn: async () => { const { data, error } = await supabase.rpc('mygrowth_team_summary', edu && branch !== ALL ? { _branch: branch } : {}); if (error) throw error; return z.array(teamRowSchema).parse(data); } });
  const rows = q.isError ? [] : q.data ?? []; const t = teamTotals(rows);
  return <section className="min-w-0 space-y-6">
    <header className="border-b-2 border-border/80 pb-4"><h1 className="flex items-center gap-2 text-xl sm:text-2xl font-semibold"><UsersRound className="h-6 w-6"/>팀 성장 현황</h1><p className="text-muted-foreground mt-1">{edu ? '본사 교육팀: 지점을 골라 볼 수 있습니다.' : '지정 담당자: 본인 소속 지점 직원만 보입니다.'} 기존 기록을 모아 보여주는 읽기 전용 화면입니다.</p></header>
    {edu && <div className="min-w-0 max-w-xs text-sm">지점<Select value={branch} onValueChange={setBranch}><SelectTrigger className="mt-1" aria-label="지점 선택"><SelectValue/></SelectTrigger><SelectContent><SelectItem value={ALL}>전체 지점</SelectItem>{(branches.data ?? []).map(b => <SelectItem key={b.branch_id} value={b.branch_id}>{b.branch_name}</SelectItem>)}</SelectContent></Select></div>}
    <QueryState query={q}>
      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">{[['직원', `${t.people}명`], ['코칭(참석)', `${t.coaching}회`], ['미작성 실행 계획', `${t.missingPlans}건`], ['후속 확인 필요', `${t.followup}건`]].map(([k, v]) => <div key={k} className="min-w-0 rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-2 text-lg font-semibold">{v}</p></div>)}</div>
      {rows.length === 0 ? <p className="py-10 text-muted-foreground">표시할 직원이 없습니다.</p> : <ul className="min-w-0">{rows.map(r => {
        const body = <div className="grid min-w-0 w-full gap-3 text-left sm:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))] sm:items-center">
          <div className="min-w-0"><p className="font-semibold break-words">{r.full_name}{r.is_senior && <span className="ml-2 text-xs font-normal text-muted-foreground">선임</span>}</p><p className="text-xs text-muted-foreground break-words">{r.branch_name}</p></div>
          <div className="min-w-0"><p className="text-xs text-muted-foreground">온라인 학습</p><p className="text-sm">수료 {r.courses_completed}/{r.courses} · 평균 {r.avg_progress}%</p><Progress value={r.avg_progress} className="mt-1 h-1.5"/></div>
          <div className="min-w-0"><p className="text-xs text-muted-foreground">오프라인 교육</p><p className="text-sm">참석 {r.offline_attended}/{r.offline_targets}</p></div>
          <div className="min-w-0"><p className="text-xs text-muted-foreground">코칭</p><p className="text-sm">현장 {r.field_coaching} · 매니저 {r.manager_coaching}</p></div>
          <div className="min-w-0"><p className="text-xs text-muted-foreground">실행 계획 · 후속</p><p className="text-sm">{planLabel(r)} · 확인 필요 {r.followup_needed}</p></div>
        </div>;
        return <li key={r.user_id} className="border-b-2 border-border/80">{r.can_open && !edu ? <Button asChild variant="ghost" className="h-auto w-full min-w-0 justify-between whitespace-normal px-2 py-4"><Link to={`/my-growth/workspace/staff/${r.user_id}`} aria-label={`${r.full_name} 성장 상세`}>{body}<ChevronRight className="h-4 w-4 shrink-0"/></Link></Button> : <div className="px-2 py-4">{body}</div>}</li>;
      })}</ul>}
      <PendingNotice title="공개 범위 기본값" text="매니저 코칭 건수와 내용은 작성한 스토어매니저에게만 보입니다. 트레이너와 본사 교육팀에게는 매니저 코칭이 0으로 표시됩니다. 직원 상세 이동은 지정 담당자에게만 열려 있습니다. 세부 공개 범위는 11월 18일 회의 후 조정합니다."/>
    </QueryState>
  </section>;
}
