import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Target, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PlanFollowup from '../components/PlanFollowup';
import { useCapabilities } from '../screens/data';

const KINDS: Record<string, string> = { education: '오프라인 교육', field_coaching: '필드 코칭', manager_coaching: '매니저 코칭' };
const LANGS: Record<string, string> = { ko: '한국어', en: '영어', ja: '일본어', zh: '중국어', yue: '광동어' };
export const PLAN_MAX = 5000;

type MyRow = { training_id: string; session_kind: string; title: string; training_date: string; branch_name: string | null; plan_id: string | null; body: string | null; original_language: string | null; updated_at: string | null };
type ScopedRow = { plan_id: string; training_id: string; session_kind: string; title: string; training_date: string; branch_name: string | null; employee_name: string; body: string; original_language: string; updated_at: string };

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString('ko-KR') : '');

function State({ q, empty, children }: { q: { isPending: boolean; isError: boolean; refetch: () => unknown }; empty: boolean; children: React.ReactNode }) {
  if (q.isPending) return <p className="flex items-center gap-2 py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />불러오는 중입니다.</p>;
  if (q.isError) return <div role="alert" className="space-y-3 py-8"><p>계획을 확인하지 못했습니다.</p><Button variant="outline" onClick={() => void q.refetch()}>다시 확인</Button></div>;
  if (empty) return <p className="py-12 text-muted-foreground">표시할 계획이 없습니다.</p>;
  return <>{children}</>;
}

function Editor({ row }: { row: MyRow }) {
  const qc = useQueryClient();
  const [body, setBody] = useState(row.body ?? '');
  const [lang, setLang] = useState(row.original_language ?? 'ko');
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('mygrowth_save_action_plan', { _training_id: row.training_id, _body: body, _original_language: lang });
      if (error) throw error;
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['mygrowth-my-plans'] }); await qc.invalidateQueries({ queryKey: ['mygrowth-screen'] }); },
  });
  const invalid = !body.trim() || body.length > PLAN_MAX;
  return <div className="space-y-3 pt-3">
    <Label htmlFor={`plan-${row.training_id}`}>실행 계획</Label>
    <Textarea id={`plan-${row.training_id}`} rows={5} maxLength={PLAN_MAX} value={body} onChange={e => setBody(e.target.value)} placeholder="교육·코칭 내용을 현장에서 어떻게 실천할지 적어 주십시오." />
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <select aria-label="작성 언어" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={lang} onChange={e => setLang(e.target.value)}>{Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <span className="text-xs text-muted-foreground">{body.length}/{PLAN_MAX}자</span>
      <Button disabled={invalid || save.isPending} onClick={() => save.mutate()}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}저장</Button>
      {save.isSuccess && <span className="text-sm text-success" aria-live="polite">저장했습니다.</span>}
      {save.isError && <span role="alert" className="text-sm text-destructive">저장하지 못했습니다. {(save.error as Error).message}</span>}
    </div>
  </div>;
}

export default function MyGrowthPlans({ staffOnly = false }: { staffOnly?: boolean }) {
  const capabilities = useCapabilities();
  const canReadStaff = !capabilities.isError && Boolean(capabilities.data?.trainer || capabilities.data?.manager);
  const { user } = useUser();
  const [tab, setTab] = useState<'mine' | 'scoped'>(staffOnly ? 'scoped' : 'mine');
  const [open, setOpen] = useState<string>();
  const mine = useQuery({ queryKey: ['mygrowth-my-plans', user?.id], enabled: Boolean(user?.id), staleTime: 0, gcTime: 0, retry: false, queryFn: async (): Promise<MyRow[]> => {
    const { data, error } = await supabase.rpc('mygrowth_my_action_plans'); if (error) throw error; return (data ?? []) as MyRow[];
  }});
  const scoped = useQuery({ queryKey: ['mygrowth-scoped-plans', user?.id], enabled: Boolean(user?.id) && tab === 'scoped' && canReadStaff, staleTime: 0, gcTime: 0, retry: false, queryFn: async (): Promise<ScopedRow[]> => {
    const { data, error } = await supabase.rpc('mygrowth_scoped_action_plans'); if (error) throw error; return (data ?? []) as ScopedRow[];
  }});
  return <section className="min-w-0 space-y-6">
    <header className="border-b-2 border-border/80 pb-4"><h1 className="flex min-w-0 items-center gap-2 text-xl sm:text-2xl font-semibold"><Target className="h-6 w-6 shrink-0" />실행 계획</h1><p className="text-muted-foreground mt-1">참석한 교육·코칭마다 현장 실천 계획을 작성합니다.</p></header>
    {!staffOnly && <Tabs value={tab} onValueChange={v => setTab(v as 'mine' | 'scoped')}><TabsList><TabsTrigger value="mine">내 계획</TabsTrigger>{canReadStaff && <TabsTrigger value="scoped">담당 직원 계획</TabsTrigger>}</TabsList></Tabs>}
    {tab === 'mine' ? <State q={mine} empty={(mine.data ?? []).length === 0}>
      <ul>{(mine.data ?? []).map(r => <li key={r.training_id} className="min-w-0 py-5 border-b-2 border-border/80">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-muted-foreground">{KINDS[r.session_kind] ?? '교육'} · {r.training_date}{r.branch_name ? ` · ${r.branch_name}` : ''}</p><h2 className="mt-2 font-semibold break-words">{r.title}</h2><p className="text-sm text-muted-foreground mt-1">{r.plan_id ? `작성됨 · ${fmt(r.updated_at)}` : '아직 작성하지 않음'}</p></div>
          <Button variant="outline" onClick={() => setOpen(open === r.training_id ? undefined : r.training_id)}>{open === r.training_id ? '닫기' : r.plan_id ? '계획 보기·수정' : '계획 작성'}</Button></div>
        {open === r.training_id && <><Editor key={`${r.training_id}-${r.updated_at}`} row={r} />{r.plan_id && <PlanFollowup planId={r.plan_id} />}</>}
      </li>)}</ul>
    </State> : <State q={scoped} empty={(scoped.data ?? []).length === 0}>
      <ul>{(scoped.data ?? []).map(r => <li key={r.plan_id} className="min-w-0 py-5 border-b-2 border-border/80"><p className="text-xs text-muted-foreground">{KINDS[r.session_kind] ?? '교육'} · {r.training_date}{r.branch_name ? ` · ${r.branch_name}` : ''} · {LANGS[r.original_language]}</p><h2 className="mt-2 font-semibold break-words">{r.employee_name} · {r.title}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm">{r.body}</p><p className="text-xs text-muted-foreground mt-2">최종 저장 {fmt(r.updated_at)} · 계획 읽기 전용</p><PlanFollowup planId={r.plan_id} staff /></li>)}</ul>
    </State>}
  </section>;
}
