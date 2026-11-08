import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { CheckCheck, History, Loader2, Pencil, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const statuses = { completed: '이행 완료', in_progress: '진행 중', not_completed: '미이행' };
const schema = z.object({
  version: z.number().int().nonnegative(), plan_updated_at: z.string(), can_assess: z.boolean(),
  history: z.array(z.object({ version: z.number(), status: z.enum(['completed', 'in_progress', 'not_completed']), note: z.string(), assessed_by: z.string(), assessed_at: z.string(), plan_body: z.string(), plan_language: z.string(), plan_updated_at: z.string() })),
});
type Status = keyof typeof statuses;
type Draft = { status: Status; note: string; version: number; planUpdatedAt: string; requestId: string };
const fmt = (v: string) => new Date(v).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

export default function PlanFollowup({ planId, staff = false }: { planId: string; staff?: boolean }) {
  const { user } = useUser();
  const qc = useQueryClient();
  const key = ['mygrowth-followup', user?.id, planId];
  const [draft, setDraft] = useState<Draft>();
  const [notice, setNotice] = useState('');
  const query = useQuery({ queryKey: key, enabled: Boolean(user?.id), staleTime: 0, gcTime: 0, retry: false, refetchInterval: 15000, queryFn: async () => {
    const { data, error } = await supabase.rpc('mygrowth_followup_detail', { _plan_id: planId });
    if (error) throw error;
    return schema.parse(data);
  }});
  const save = useMutation({ mutationFn: async () => {
    if (!draft) throw new Error('판정 입력을 확인해 주십시오.');
    const { error } = await supabase.rpc('mygrowth_save_followup', { _plan_id: planId, _status: draft.status, _note: draft.note, _expected_version: draft.version, _expected_plan_updated_at: draft.planUpdatedAt, _request_id: draft.requestId });
    if (error) throw error;
  }, onSuccess: async () => {
    setDraft(undefined); setNotice('판정을 저장했습니다.');
    await qc.invalidateQueries({ queryKey: key });
    await qc.invalidateQueries({ queryKey: ['mygrowth-screen'] });
  }, onError: async (e: { code?: string }) => {
    if (e.code === '40001' || e.code === '42501') setDraft(undefined);
    setNotice(e.code === '40001' ? '계획 또는 판정이 변경되었습니다. 최신 내용을 확인한 뒤 다시 판정해 주십시오.' : e.code === '42501' ? '저장 권한이 없습니다. 현재 담당 범위를 다시 확인해 주십시오.' : '저장 결과를 확인하지 못했습니다. 입력을 그대로 두고 다시 저장하면 중복 없이 확인합니다.');
    await qc.invalidateQueries({ queryKey: key });
    await qc.invalidateQueries({ queryKey: ['mygrowth-scoped-plans'] });
  }});
  if (query.isPending) return <p className="flex min-w-0 items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />후속 확인을 불러오는 중입니다.</p>;
  if (query.isError || !query.data) return <div role="alert" className="space-y-2 py-4"><p className="text-sm">판정 이력과 접근 권한을 확인하지 못했습니다.</p><Button variant="outline" onClick={() => void query.refetch()}>다시 확인</Button></div>;
  const data = query.data;
  const latest = data.history[0];
  return <section aria-label="후속 확인" className="min-w-0 space-y-4 border-t border-border pt-4 mt-4">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><h3 className="flex min-w-0 items-center gap-2 font-semibold"><CheckCheck className="h-5 w-5 shrink-0" />후속 확인 <span className="text-sm font-normal text-muted-foreground">{latest ? statuses[latest.status] : '판정 전'}</span></h3>
      {staff && data.can_assess && !draft && <Button variant="outline" disabled={query.isFetching} onClick={() => { setNotice(''); setDraft({ status: latest?.status ?? 'in_progress', note: '', version: data.version, planUpdatedAt: data.plan_updated_at, requestId: crypto.randomUUID() }); }}><Pencil className="h-4 w-4" />{latest ? '추가 판정·정정' : '이행 판정'}</Button>}
    </div>
    {notice && <p role="status" className="text-sm break-words">{notice}</p>}
    {latest && <div className="min-w-0 space-y-2 text-sm"><p className="whitespace-pre-wrap break-words">{latest.note}</p><p className="text-xs text-muted-foreground break-words">{latest.assessed_by} · {fmt(latest.assessed_at)}</p>{latest.plan_updated_at !== data.plan_updated_at && <p className="text-sm text-muted-foreground">판정 이후 실행 계획이 수정되었습니다.</p>}</div>}
    {draft && staff && data.can_assess && <form className="min-w-0 space-y-4" onSubmit={e => { e.preventDefault(); setNotice(''); save.mutate(); }}>
      <fieldset disabled={save.isPending || query.isFetching} className="min-w-0 space-y-4">
        <div className="max-w-xs space-y-2"><Label htmlFor={`status-${planId}`}>이행 상태</Label><Select value={draft.status} onValueChange={v => setDraft({ ...draft, status: v as Status, requestId: crypto.randomUUID() })}><SelectTrigger id={`status-${planId}`}><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statuses).map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor={`note-${planId}`}>판정 의견·정정 사유</Label><Textarea id={`note-${planId}`} rows={4} maxLength={5000} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value, requestId: crypto.randomUUID() })} /><p className="text-xs text-muted-foreground">{draft.note.length}/5000자</p></div>
      </fieldset>
      <div className="flex min-w-0 flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={save.isPending} onClick={() => setDraft(undefined)}>취소</Button><Button type="submit" disabled={!draft.note.trim() || save.isPending || query.isFetching}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Save className="h-4 w-4" />}판정 저장</Button></div>
    </form>}
    {data.history.length > 0 && <details><summary className="cursor-pointer text-sm font-medium"><History className="inline h-4 w-4 mr-1" />판정 이력 {data.history.length}건</summary><ol className="mt-3">{data.history.map(h => <li key={h.version} className="min-w-0 border-b-2 border-border/80 py-4 space-y-2 text-sm"><p className="font-medium">{h.version}차 · {statuses[h.status]}</p><p className="text-xs text-muted-foreground break-words">{h.assessed_by} · {fmt(h.assessed_at)}</p><p className="whitespace-pre-wrap break-words">{h.note}</p><details><summary className="cursor-pointer text-xs text-muted-foreground">판정 당시 실행 계획</summary><p className="mt-2 whitespace-pre-wrap break-words">{h.plan_body}</p></details></li>)}</ol></details>}
  </section>;
}