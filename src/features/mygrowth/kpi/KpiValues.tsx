import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { Input } from '@/components/ui/input';
import { QueryState } from '../screens/Shared';
import { useCapabilities } from '../screens/data';

export default function KpiValues() {
  const { user } = useUser(); const caps = useCapabilities();
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const q = useQuery({ queryKey: ['mygrowth-kpi-values', user?.id, from, to], enabled: Boolean(user?.id), staleTime: 0, gcTime: 0, retry: false,
    queryFn: async () => { const { data, error } = await supabase.rpc('mygrowth_kpi_values_list', { _from: (from ? from + '-01' : null) as string, _to: (to ? to + '-01' : null) as string }); if (error) throw error; return data ?? []; } });
  const c = caps.data; const scope = c?.can_appoint ? '본사 교육팀: 전체 지점' : c?.trainer || c?.manager ? '지정 담당자: 본인 소속 지점' : '직원: 본인 성과';
  const rows = q.data ?? [];
  return <div className="min-w-0 space-y-6">
    <header className="border-b-2 border-border/80 pb-4"><h1 className="flex items-center gap-2 text-xl sm:text-2xl font-semibold"><TrendingUp className="h-6 w-6"/>매장 성과(KPI)</h1><p className="text-muted-foreground mt-1">외부 시스템에서 받은 직원별 월 성과입니다. 열람 범위: {scope}</p></header>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2"><label className="text-sm">시작 월<Input type="month" value={from} onChange={e => setFrom(e.target.value)} className="mt-1"/></label><label className="text-sm">종료 월<Input type="month" value={to} onChange={e => setTo(e.target.value)} className="mt-1"/></label></div>
    <QueryState query={q}>{rows.length === 0 ? <p className="py-10 text-muted-foreground">받은 성과가 없습니다.</p> :
      <div className="min-w-0 overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b-2 border-border/80 text-left text-muted-foreground"><th className="py-2 pr-3 font-medium">월</th><th className="py-2 pr-3 font-medium">지점</th><th className="py-2 pr-3 font-medium">직원</th><th className="py-2 pr-3 font-medium">지표</th><th className="py-2 pr-3 font-medium text-right">값</th><th className="py-2 font-medium">보낸 업체</th></tr></thead>
        <tbody>{rows.map(r => <tr key={`${r.user_id}-${r.period}-${r.metric_code}`} className="border-b-2 border-border/80"><td className="py-2 pr-3">{r.period.slice(0, 7)}</td><td className="py-2 pr-3">{r.branch_name}</td><td className="py-2 pr-3">{r.full_name}</td><td className="py-2 pr-3">{r.metric_name}</td><td className="py-2 pr-3 text-right tabular-nums">{Number(r.value).toLocaleString('ko-KR')} {r.unit}</td><td className="py-2">{r.vendor}</td></tr>)}</tbody></table></div>}
    </QueryState>
  </div>;
}
