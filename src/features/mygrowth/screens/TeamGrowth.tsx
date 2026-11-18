import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './copy';
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
import HqVisibilitySetting from '../components/HqVisibilitySetting';
import { teamRowSchema, branchSchema, teamTotals } from './teamData';

const ALL = 'all';
export default function TeamGrowth() {
  const { t } = useTranslation();
  const { user } = useUser(); const caps = useCapabilities(); const edu = Boolean(caps.data?.can_appoint);
  const [branch, setBranch] = useState(ALL);
  const branches = useQuery({ queryKey: ['mygrowth-team-branches', user?.id], enabled: Boolean(user?.id) && edu, staleTime: 0, gcTime: 0, retry: false,
    queryFn: async () => { const { data, error } = await supabase.rpc('mygrowth_team_branches'); if (error) throw error; return branchSchema.parse(data); } });
  const q = useQuery({ queryKey: ['mygrowth-team-summary', user?.id, edu, branch], enabled: Boolean(user?.id) && caps.isSuccess, staleTime: 0, gcTime: 0, retry: false, refetchInterval: 15000,
    queryFn: async () => { const { data, error } = await supabase.rpc('mygrowth_team_summary', edu && branch !== ALL ? { _branch: branch } : {}); if (error) throw error; return z.array(teamRowSchema).parse(data); } });
  const rows = q.isError ? [] : q.data ?? []; const totals = teamTotals(rows);
  return <section className="min-w-0 space-y-6">
    <header className="border-b-2 border-border/80 pb-4"><h1 className="flex items-center gap-2 text-xl sm:text-2xl font-semibold"><UsersRound className="h-6 w-6"/>{t('mg.teamGrowth')}</h1><p className="text-muted-foreground mt-1">{t(edu ? 'mg.teamEducation' : 'mg.teamSenior')}</p></header>
    {edu && <div className="min-w-0 max-w-xs text-sm">{t('mg.branch')}<Select value={branch} onValueChange={setBranch}><SelectTrigger className="mt-1" aria-label={t('mg.selectBranch')}><SelectValue/></SelectTrigger><SelectContent><SelectItem value={ALL}>{t('mg.allBranches')}</SelectItem>{(branches.data ?? []).map(b => <SelectItem key={b.branch_id} value={b.branch_id}>{b.branch_name}</SelectItem>)}</SelectContent></Select></div>}
    {edu && <HqVisibilitySetting/>}
    <QueryState query={q}>
      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">{[[t('mg.staff'), t('mg.peopleCount', { n: totals.people })], [t('mg.attendedCoaching'), t('mg.times', { n: totals.coaching })], [t('mg.missingPlans'), t('mg.count', { n: totals.missingPlans })], [t('mg.followupNeeded'), t('mg.count', { n: totals.followup })]].map(([k, v]) => <div key={k} className="min-w-0 rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-2 text-lg font-semibold">{v}</p></div>)}</div>
      {rows.length === 0 ? <p className="py-10 text-muted-foreground">{t('mg.teamEmpty')}</p> : <ul className="min-w-0">{rows.map(r => {
        const body = <div className="grid min-w-0 w-full gap-3 text-left sm:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))] sm:items-center">
          <div className="min-w-0"><p className="font-semibold break-words">{r.full_name}{r.is_senior && <span className="ml-2 text-xs font-normal text-muted-foreground">{t('mg.senior')}</span>}</p><p className="text-xs text-muted-foreground break-words">{r.branch_name}</p></div>
          <div className="min-w-0"><p className="text-xs text-muted-foreground">{t('mg.onlineLearning')}</p><p className="text-sm">{t('mg.courseSummary', { done: r.courses_completed, total: r.courses, progress: r.avg_progress })}</p><Progress value={r.avg_progress} className="mt-1 h-1.5"/></div>
          <div className="min-w-0"><p className="text-xs text-muted-foreground">{t('mg.offline')}</p><p className="text-sm">{t('mg.attendanceSummary', { done: r.offline_attended, total: r.offline_targets })}</p></div>
          <div className="min-w-0"><p className="text-xs text-muted-foreground">{t('mg.coaching')}</p><p className="text-sm">{t('mg.coachingSummary', { field: r.field_coaching, manager: r.manager_coaching })}</p></div>
          <div className="min-w-0"><p className="text-xs text-muted-foreground">{t('mg.planFollowup')}</p><p className="text-sm">{r.plans_needed === 0 ? t('mg.noTargets') : t('mg.plansWritten', { written: r.plans_written, needed: r.plans_needed })} · {t('mg.checksNeeded', { n: r.followup_needed })}</p></div>
        </div>;
        return <li key={r.user_id} className="border-b-2 border-border/80">{r.can_open ? <Button asChild variant="ghost" className="h-auto w-full min-w-0 justify-between whitespace-normal px-2 py-4"><Link to={`/my-growth/workspace/staff/${r.user_id}`} aria-label={t('mg.staffDetail', { name: r.full_name })}>{body}<ChevronRight className="h-4 w-4 shrink-0"/></Link></Button> : <div className="px-2 py-4">{body}</div>}</li>;
      })}</ul>}
      <PendingNotice title={t('mg.privacyDefaults')} text={t('mg.teamPrivacy')}/>
    </QueryState>
  </section>;
}
