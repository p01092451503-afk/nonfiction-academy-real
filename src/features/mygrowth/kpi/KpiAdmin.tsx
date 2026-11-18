import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plug, KeyRound, BookOpen, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { QueryState } from '../screens/Shared';

type Key = { id: string; label: string; key_prefix: string; is_test: boolean; created_at: string; last_used_at: string | null; revoked_at: string | null };
type Vendor = { id: string; name: string; active: boolean; allowed_ips: string[]; keys: Key[] };
type Overview = { vendors: Vendor[]; metrics: { code: string; name: string; unit: string; description: string; active: boolean }[]; logs: { id: string; vendor: string; received_at: string; total: number; succeeded: number; failed: number; status: string; errors: { index?: number; code: string }[] }[] };
const fmt = (s: string | null) => s ? new Date(s).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-';
const statusLabel: Record<string, string> = { success: '전체 성공', partial: '일부 실패', failed: '전체 실패', rejected: '접속 거부' };
const msg = (e: unknown) => (e as { message?: string })?.message || '처리하지 못했습니다.';

export default function KpiAdmin() {
  const { user } = useUser(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['mygrowth-kpi-admin', user?.id], enabled: Boolean(user?.id), staleTime: 0, gcTime: 0, retry: false,
    queryFn: async () => { const { data, error } = await supabase.rpc('mygrowth_kpi_admin_overview'); if (error) throw error; return data as unknown as Overview; } });
  const refresh = () => qc.invalidateQueries({ queryKey: ['mygrowth-kpi-admin'] });
  const [vendorName, setVendorName] = useState(''); const [issued, setIssued] = useState<{ vendor: string; key: string } | null>(null);
  const [metric, setMetric] = useState({ code: '', name: '', unit: '', description: '' });
  const saveVendor = useMutation({ mutationFn: async (v: { id: string | null; name: string; ips: string[]; active: boolean }) => { const { error } = await supabase.rpc('mygrowth_kpi_save_vendor', { _id: v.id as string, _name: v.name, _allowed_ips: v.ips, _active: v.active }); if (error) throw error; }, onSuccess: () => { setVendorName(''); refresh(); toast.success('저장했습니다.'); }, onError: e => toast.error(msg(e)) });
  const issue = useMutation({ mutationFn: async (v: { vendor: Vendor; test: boolean }) => { const { data, error } = await supabase.rpc('mygrowth_kpi_issue_key', { _vendor: v.vendor.id, _label: v.test ? '시험 키' : '운영 키', _is_test: v.test }); if (error) throw error; return { vendor: v.vendor.name, key: (data as { key: string }).key }; }, onSuccess: r => { setIssued(r); refresh(); }, onError: e => toast.error(msg(e)) });
  const revoke = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.rpc('mygrowth_kpi_revoke_key', { _key: id }); if (error) throw error; }, onSuccess: () => { refresh(); toast.success('키를 폐기했습니다. 이 키로는 더 이상 보낼 수 없습니다.'); }, onError: e => toast.error(msg(e)) });
  const saveMetric = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc('mygrowth_kpi_save_metric', { _code: metric.code, _name: metric.name, _unit: metric.unit, _description: metric.description, _active: true }); if (error) throw error; }, onSuccess: () => { setMetric({ code: '', name: '', unit: '', description: '' }); refresh(); toast.success('지표를 저장했습니다.'); }, onError: () => toast.error('지표 코드는 영문 대문자로 시작하는 대문자·숫자·밑줄(2~40자)이어야 합니다.') });
  const d = q.data;
  return <div className="min-w-0 space-y-8">
    <header className="border-b-2 border-border/80 pb-4"><h1 className="flex items-center gap-2 text-xl sm:text-2xl font-semibold"><Plug className="h-6 w-6"/>외부 성과(KPI) 연동 관리</h1><p className="text-muted-foreground mt-1">외부 업체가 보내는 직원 성과 자료의 업체·키·지표·수신 기록을 관리합니다. 본사 교육팀 전용입니다.</p>
      <div className="mt-3 flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link to="/my-growth/workspace/kpi/guide"><BookOpen className="mr-1 h-4 w-4"/>API 연동 가이드</Link></Button><Button asChild variant="outline" size="sm"><Link to="/my-growth/kpi">받은 성과 보기</Link></Button></div></header>
    <QueryState query={q}>{d && <>
      {issued && <div role="alert" className="min-w-0 rounded-lg border-2 border-primary bg-card p-4 space-y-2"><p className="font-semibold">{issued.vendor} 키가 발급됐습니다. 이 화면을 닫으면 다시 볼 수 없습니다.</p><code className="block break-all rounded bg-muted p-2 text-xs">{issued.key}</code><div className="flex gap-2"><Button size="sm" onClick={() => { void navigator.clipboard?.writeText(issued.key); toast.success('복사했습니다.'); }}><Copy className="mr-1 h-4 w-4"/>복사</Button><Button size="sm" variant="outline" onClick={() => setIssued(null)}>확인했습니다</Button></div></div>}
      <section className="space-y-3"><h2 className="text-lg font-semibold">연동 업체와 API 키</h2>
        <form className="flex min-w-0 gap-2" onSubmit={e => { e.preventDefault(); if (vendorName.trim()) saveVendor.mutate({ id: null, name: vendorName, ips: [], active: true }); }}><Input value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="새 업체 이름" aria-label="새 업체 이름" className="min-w-0"/><Button type="submit" disabled={saveVendor.isPending}>업체 추가</Button></form>
        {d.vendors.length === 0 ? <p className="text-muted-foreground">등록된 업체가 없습니다.</p> : d.vendors.map(v => <VendorCard key={v.id} v={v} onIps={ips => saveVendor.mutate({ id: v.id, name: v.name, ips, active: v.active })} onIssue={test => issue.mutate({ vendor: v, test })} onRevoke={id => revoke.mutate(id)}/>)}
      </section>
      <section className="space-y-3"><h2 className="text-lg font-semibold">성과 지표 정의</h2>
        <div className="min-w-0 overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr className="border-b-2 border-border/80 text-left text-muted-foreground"><th className="py-2 pr-3 font-medium">지표 코드</th><th className="py-2 pr-3 font-medium">이름</th><th className="py-2 pr-3 font-medium">단위</th><th className="py-2 font-medium">설명</th></tr></thead><tbody>{d.metrics.map(m => <tr key={m.code} className="border-b-2 border-border/80"><td className="py-2 pr-3 font-mono">{m.code}</td><td className="py-2 pr-3">{m.name}</td><td className="py-2 pr-3">{m.unit}</td><td className="py-2 break-words">{m.description}</td></tr>)}</tbody></table></div>
        <form className="grid min-w-0 gap-2 sm:grid-cols-5" onSubmit={e => { e.preventDefault(); saveMetric.mutate(); }}><Input aria-label="지표 코드" placeholder="코드 (예: SALES_AMOUNT)" value={metric.code} onChange={e => setMetric({ ...metric, code: e.target.value.toUpperCase() })}/><Input aria-label="지표 이름" placeholder="이름" value={metric.name} onChange={e => setMetric({ ...metric, name: e.target.value })}/><Input aria-label="단위" placeholder="단위 (KRW, 건)" value={metric.unit} onChange={e => setMetric({ ...metric, unit: e.target.value })}/><Input aria-label="설명" placeholder="설명" value={metric.description} onChange={e => setMetric({ ...metric, description: e.target.value })}/><Button type="submit" disabled={!metric.code || !metric.name || !metric.unit || saveMetric.isPending}>지표 저장</Button></form>
      </section>
      <section className="space-y-3"><h2 className="text-lg font-semibold">최근 수신 기록</h2>
        {d.logs.length === 0 ? <p className="text-muted-foreground">아직 받은 자료가 없습니다.</p> : <div className="min-w-0 overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b-2 border-border/80 text-left text-muted-foreground"><th className="py-2 pr-3 font-medium">받은 시간</th><th className="py-2 pr-3 font-medium">업체</th><th className="py-2 pr-3 font-medium">결과</th><th className="py-2 pr-3 font-medium">전체</th><th className="py-2 pr-3 font-medium">성공</th><th className="py-2 pr-3 font-medium">실패</th><th className="py-2 font-medium">오류 내용</th></tr></thead><tbody>{d.logs.map(l => <tr key={l.id} className="border-b-2 border-border/80"><td className="py-2 pr-3">{fmt(l.received_at)}</td><td className="py-2 pr-3">{l.vendor}</td><td className="py-2 pr-3">{statusLabel[l.status] ?? l.status}</td><td className="py-2 pr-3">{l.total}</td><td className="py-2 pr-3">{l.succeeded}</td><td className="py-2 pr-3">{l.failed}</td><td className="py-2 break-words font-mono text-xs">{l.errors.map(e => e.index !== undefined ? `${e.index + 1}행 ${e.code}` : e.code).join(', ') || '-'}</td></tr>)}</tbody></table></div>}
      </section>
    </>}</QueryState>
  </div>;
}

function VendorCard({ v, onIps, onIssue, onRevoke }: { v: Vendor; onIps: (ips: string[]) => void; onIssue: (test: boolean) => void; onRevoke: (id: string) => void }) {
  const [ips, setIps] = useState(v.allowed_ips.join(', '));
  return <div className="min-w-0 rounded-lg border border-border bg-card p-4 space-y-3">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><h3 className="font-semibold break-words">{v.name}</h3><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => onIssue(true)}><KeyRound className="mr-1 h-4 w-4"/>시험 키 발급</Button><Button size="sm" onClick={() => onIssue(false)}><KeyRound className="mr-1 h-4 w-4"/>운영 키 발급</Button></div></div>
    <form className="flex min-w-0 gap-2" onSubmit={e => { e.preventDefault(); onIps(ips.split(',').map(s => s.trim()).filter(Boolean)); }}><Input aria-label={`${v.name} 허용 IP`} value={ips} onChange={e => setIps(e.target.value)} placeholder="허용 IP (쉼표로 구분, 비우면 제한 없음)" className="min-w-0"/><Button type="submit" size="sm" variant="outline">IP 저장</Button></form>
    {v.keys.length === 0 ? <p className="text-sm text-muted-foreground">발급된 키가 없습니다.</p> : <ul className="min-w-0">{v.keys.map(k => <li key={k.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b-2 border-border/80 py-2 text-sm"><div className="min-w-0"><span className="font-mono">{k.key_prefix}…</span> <span className="text-muted-foreground">{k.label} · 발급 {fmt(k.created_at)} · 마지막 사용 {fmt(k.last_used_at)}</span></div>{k.revoked_at ? <span className="text-muted-foreground">폐기됨 {fmt(k.revoked_at)}</span> : <Button size="sm" variant="destructive" onClick={() => { if (confirm('이 키를 폐기하면 업체가 더 이상 보낼 수 없습니다. 폐기하시겠습니까?')) onRevoke(k.id); }}>폐기</Button>}</li>)}</ul>}
  </div>;
}
