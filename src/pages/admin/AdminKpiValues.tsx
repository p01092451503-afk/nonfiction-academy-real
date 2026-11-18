import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';

export default function AdminKpiValues() {
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const q = useQuery({ queryKey: ['admin-kpi-values', from, to], staleTime: 0, retry: false,
    queryFn: async () => { const { data, error } = await supabase.rpc('kpi_admin_values', { _from: (from ? from + '-01' : null) as string, _to: (to ? to + '-01' : null) as string }); if (error) throw error; return data ?? []; } });
  const rows = q.data ?? [];
  return <div className="min-w-0 space-y-6">
    <header className="border-b-2 border-border/80 pb-4"><h1 className="flex items-center gap-2 text-xl sm:text-2xl font-semibold"><TrendingUp className="h-6 w-6"/>받은 성과(KPI)</h1><p className="text-muted-foreground mt-1">외부 시스템에서 받은 직원별 월 성과입니다.</p></header>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2"><label className="text-sm">시작 월<Input type="month" value={from} onChange={e => setFrom(e.target.value)} className="mt-1"/></label><label className="text-sm">종료 월<Input type="month" value={to} onChange={e => setTo(e.target.value)} className="mt-1"/></label></div>
    {q.isLoading ? <p className="text-muted-foreground">불러오는 중입니다.</p> : q.isError ? <p className="text-destructive">성과를 불러오지 못했습니다.</p> : rows.length === 0 ? <p className="py-10 text-muted-foreground">받은 성과가 없습니다.</p> :
      <div className="min-w-0 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b-2 border-border/80 text-left text-muted-foreground"><th className="py-2 pr-3 font-medium">월</th><th className="py-2 pr-3 font-medium">지점</th><th className="py-2 pr-3 font-medium">직원</th><th className="py-2 pr-3 font-medium">이메일</th><th className="py-2 pr-3 font-medium">지표</th><th className="py-2 pr-3 font-medium text-right">값</th><th className="py-2 font-medium">보낸 업체</th></tr></thead>
        <tbody>{rows.map(r => <tr key={`${r.user_id}-${r.period}-${r.metric_code}`} className="border-b-2 border-border/80"><td className="py-2 pr-3">{r.period.slice(0, 7)}</td><td className="py-2 pr-3">{r.branch_name}</td><td className="py-2 pr-3">{r.full_name}</td><td className="py-2 pr-3 break-all">{r.email}</td><td className="py-2 pr-3">{r.metric_name}</td><td className="py-2 pr-3 text-right tabular-nums">{Number(r.value).toLocaleString('ko-KR')} {r.unit}</td><td className="py-2">{r.vendor}</td></tr>)}</tbody></table></div>}
  </div>;
}
