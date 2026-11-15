import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QueryState, PendingNotice } from './Shared';
import { useCapabilities } from './data';
import { reportRowSchema, levelLabel, formatMinutes, defaultPeriod, type ReportLevel } from './timeReport';

export default function TimeReport() {
  const { user } = useUser(); const caps = useCapabilities();
  const init = defaultPeriod(new Date());
  const [from, setFrom] = useState(init.from); const [to, setTo] = useState(init.to);
  const [level, setLevel] = useState<ReportLevel>('person');
  const valid = Boolean(from && to && from <= to);
  const q = useQuery({ queryKey: ['mygrowth-time-report', user?.id, from, to, level], enabled: Boolean(user?.id) && valid, staleTime: 0, gcTime: 0, retry: false,
    queryFn: async () => { const { data, error } = await supabase.rpc('mygrowth_time_report', { _from: from, _to: to, _level: level }); if (error) throw error; return z.array(reportRowSchema).parse(data); } });
  const rows = q.data ?? []; const c = caps.data;
  const scope = c?.can_appoint ? '본사 교육팀: 전체 지점' : c?.trainer || c?.manager ? '지정 담당자: 본인 소속 지점' : '직원: 본인 기록';
  const total = rows.reduce((a, r) => ({ online: a.online + r.online_minutes, offline: a.offline + r.offline_minutes, field: a.field + r.field_minutes, manager: a.manager + r.manager_minutes }), { online: 0, offline: 0, field: 0, manager: 0 });
  const hidden = rows.some(r => r.manager_hidden);
  return <div className="min-w-0 space-y-6">
    <header className="border-b-2 border-border/80 pb-4"><h1 className="flex items-center gap-2 text-xl sm:text-2xl font-semibold"><BarChart3 className="h-6 w-6"/>교육·코칭 시간 보고서</h1><p className="text-muted-foreground mt-1">기존 기록을 모아 보여주는 읽기 전용 보고서입니다. 열람 범위: {scope}</p></header>
    <div className="grid min-w-0 gap-3 sm:grid-cols-3">
      <label className="min-w-0 text-sm">시작일<Input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="mt-1"/></label>
      <label className="min-w-0 text-sm">종료일<Input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="mt-1"/></label>
      <div className="min-w-0 text-sm">보고 단위<Select value={level} onValueChange={v => setLevel(v as ReportLevel)}><SelectTrigger className="mt-1" aria-label="보고 단위"><SelectValue/></SelectTrigger><SelectContent>{(['person','branch','region','global'] as const).map(l => <SelectItem key={l} value={l}>{levelLabel[l]}</SelectItem>)}</SelectContent></Select></div>
    </div>
    {!valid ? <p role="alert" className="text-sm text-destructive">종료일은 시작일보다 빠를 수 없습니다.</p> : <QueryState query={q}>
      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        {[['온라인 학습시간', total.online], ['오프라인 교육 참석시간', total.offline], ['현장 코칭 시간', total.field], ['매니저 코칭 시간', total.manager]].map(([k, v]) => <div key={k} className="min-w-0 rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground break-words">{k}</p><p className="mt-2 text-lg font-semibold">{formatMinutes(Number(v))}</p></div>)}
      </div>
      {rows.length === 0 ? <p className="py-10 text-muted-foreground">선택한 기간에 기록이 없습니다.</p> :
      <div className="min-w-0 overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b-2 border-border/80 text-left text-muted-foreground"><th className="py-3 pr-3 font-medium">{levelLabel[level]}</th><th className="py-3 pr-3 font-medium">인원</th><th className="py-3 pr-3 font-medium">온라인</th><th className="py-3 pr-3 font-medium">오프라인 교육</th><th className="py-3 pr-3 font-medium">현장 코칭</th><th className="py-3 font-medium">매니저 코칭</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.scope_key} className="border-b-2 border-border/80"><td className="py-3 pr-3 break-words">{r.scope_label}</td><td className="py-3 pr-3">{r.people}명</td><td className="py-3 pr-3">{formatMinutes(r.online_minutes)}</td><td className="py-3 pr-3">{formatMinutes(r.offline_minutes)}</td><td className="py-3 pr-3">{formatMinutes(r.field_minutes)}</td><td className="py-3">{formatMinutes(r.manager_minutes)}{r.manager_hidden && <span className="ml-1 text-xs text-muted-foreground">(일부 비공개)</span>}</td></tr>)}</tbody></table></div>}
      {hidden && <PendingNotice title="고객 결정 사항" text="매니저 코칭은 작성한 스토어매니저와 해당 직원 본인에게만 합산됩니다. 본사 교육팀·트레이너에게 시간 합계만 공개할지는 11월 18일 회의에서 결정합니다. 코칭 원문은 어떤 경우에도 이 보고서에 나오지 않습니다."/>}
      <p className="text-xs text-muted-foreground break-words">기본 기준(회의 후 조정 가능): 온라인 시간은 학습 세션마다 최대 30분까지 더한 뒤 반올림합니다. 오프라인 교육과 코칭은 참석이 확인된 기록만 실제 진행 시간(없으면 계획 시간)으로 더합니다. 날짜는 한국시간 기준입니다.</p>
    </QueryState>}
  </div>;
}
