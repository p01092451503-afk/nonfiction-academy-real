import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Check, Loader2, Pencil, Save, Search, Users, UserX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

const attendanceSchema = z.object({
  version: z.number().int().nonnegative(), updated_at: z.string().nullable(),
  people: z.array(z.object({ user_id: z.string().uuid(), full_name: z.string(), status: z.enum(['pending', 'attended', 'absent']) })),
  history: z.array(z.object({ version: z.number(), changed_at: z.string(), changed_by: z.string(), attended_count: z.number() })),
});
type Person = z.infer<typeof attendanceSchema>['people'][number];

function PeopleList({ people, empty }: { people: Person[]; empty: string }) {
  return people.length === 0 ? <p className="py-5 text-sm text-muted-foreground">{empty}</p> :
    <ul>{people.map(p => <li key={p.user_id} className="border-b-2 border-border/80 py-4 min-w-0 break-words">{p.full_name}</li>)}</ul>;
}

export default function TrainingAttendance({ trainingId }: { trainingId: string }) {
  const { user } = useUser();
  const client = useQueryClient();
  const key = ['mygrowth-attendance', user?.id, trainingId];
  const [draft, setDraft] = useState<{ version: number; ids: string[] }>();
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const query = useQuery({ queryKey: key, enabled: Boolean(user?.id), staleTime: 0, gcTime: 0, retry: false, refetchInterval: 15_000, queryFn: async () => {
    const { data, error } = await supabase.rpc('mygrowth_attendance_detail', { _training_id: trainingId });
    if (error) throw error;
    return attendanceSchema.parse(data);
  }});
  const save = useMutation({ mutationFn: async () => {
    if (!draft) throw new Error('참석 선택을 확인해 주십시오.');
    const { error } = await supabase.rpc('mygrowth_attendance_save', { _training_id: trainingId, _attended_ids: draft.ids, _expected_version: draft.version });
    if (error) throw error;
  }, onSuccess: async () => {
    setDraft(undefined);
    setNotice('참석 내역을 저장했습니다.');
    await client.invalidateQueries({ queryKey: key });
    await client.invalidateQueries({ queryKey: ['mygrowth-learning', user?.id] });
  }, onError: async (error: { code?: string }) => {
    if (error.code === '40001') {
      setDraft(undefined);
      setNotice('다른 담당자가 참석 내역을 변경했습니다. 최신 내역을 확인한 뒤 다시 선택해 주십시오.');
    } else setNotice('저장하지 못했습니다. 담당 권한과 직원의 소속을 다시 확인해 주십시오.');
    await client.invalidateQueries({ queryKey: key });
  }});
  if (query.isPending) return <p className="flex min-w-0 items-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />참석 내역을 불러오는 중입니다.</p>;
  if (query.isError || !query.data) return <div role="alert" className="space-y-3"><p>참석 내역과 담당 권한을 확인하지 못했습니다.</p><Button variant="outline" onClick={() => void query.refetch()}>다시 확인</Button></div>;
  const data = query.data;
  const attended = data.people.filter(p => p.status === 'attended');
  const absent = data.people.filter(p => p.status === 'absent');
  const filtered = data.people.filter(p => p.full_name.includes(search.trim()));
  return <section className="min-w-0 space-y-5 border-t border-border pt-6">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <h3 className="flex min-w-0 items-center gap-2 font-semibold"><Users className="h-5 w-5 shrink-0" />참석 관리 <span className="text-sm font-normal text-muted-foreground">대상 {data.people.length}명</span></h3>
      {!draft && <Button variant="outline" onClick={() => { setDraft({ version: data.version, ids: attended.map(p => p.user_id) }); setSearch(''); setNotice(''); }}><Pencil className="h-4 w-4" />{data.version === 0 ? '참석 등록' : '참석 수정'}</Button>}
    </div>
    {notice && <p role="status" className="text-sm break-words">{notice}</p>}
    {draft ? <form className="space-y-5" onSubmit={e => { e.preventDefault(); setNotice(''); save.mutate(); }}>
      <fieldset disabled={save.isPending || query.isFetching} className="min-w-0 space-y-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><h4 className="font-semibold">실제 참석 직원 <span className="text-muted-foreground">{draft.ids.length}명 선택</span></h4><div className="flex min-w-0 flex-wrap gap-2"><Button type="button" variant="ghost" disabled={filtered.length === 0} onClick={() => setDraft({ ...draft, ids: [...new Set([...draft.ids, ...filtered.map(p => p.user_id)])] })}><Check className="h-4 w-4" />검색 결과 전체 선택</Button><Button type="button" variant="ghost" onClick={() => setDraft({ ...draft, ids: [] })}>선택 해제</Button></div></div>
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="참석 대상 이름 검색" placeholder="직원 이름 검색" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
        {filtered.length === 0 ? <p className="py-4 text-sm text-muted-foreground">해당 직원이 없습니다.</p> : <ul>{filtered.map(p => <li key={p.user_id} className="border-b-2 border-border/80 py-4"><label className="flex min-w-0 items-center gap-3 cursor-pointer"><Checkbox aria-label={`${p.full_name} 참석`} checked={draft.ids.includes(p.user_id)} onCheckedChange={checked => setDraft({ ...draft, ids: checked === true ? [...new Set([...draft.ids, p.user_id])] : draft.ids.filter(id => id !== p.user_id) })} /><span className="min-w-0 break-words">{p.full_name}</span></label></li>)}</ul>}
        <p className="text-sm text-muted-foreground">참석 {draft.ids.length}명 · 미참석 {data.people.length - draft.ids.length}명</p>
      </fieldset>
      <div className="flex min-w-0 justify-end gap-3"><Button type="button" variant="outline" disabled={save.isPending} onClick={() => setDraft(undefined)}>취소</Button><Button type="submit" disabled={save.isPending || query.isFetching}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Save className="h-4 w-4" />}참석 저장</Button></div>
    </form> : data.version === 0 ? <div><h4 className="text-sm text-muted-foreground">참석 확인 대기 {data.people.length}명</h4><PeopleList people={data.people} empty="등록된 참석 대상이 없습니다." /></div> : <>
      <div className="grid min-w-0 gap-6 sm:grid-cols-2"><div className="min-w-0"><h4 className="flex min-w-0 items-center gap-2 font-semibold"><Check className="h-4 w-4 text-success" />참석자 {attended.length}명</h4><PeopleList people={attended} empty="참석자가 없습니다." /></div><div className="min-w-0"><h4 className="flex min-w-0 items-center gap-2 font-semibold"><UserX className="h-4 w-4 text-muted-foreground" />미참석자 {absent.length}명</h4><PeopleList people={absent} empty="미참석자가 없습니다." /></div></div>
      {data.updated_at && <p className="text-sm text-muted-foreground">최근 저장 {new Date(data.updated_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>}
    </>}
    {data.history.length > 0 && <details className="border-t border-border pt-4"><summary className="cursor-pointer text-sm font-medium">참석 변경 이력 {data.history.length}건</summary><ul className="mt-3">{data.history.map(h => <li key={h.version} className="border-b-2 border-border/80 py-3 text-sm break-words">{new Date(h.changed_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · {h.changed_by} · 참석 {h.attended_count}명 / 미참석 {data.people.length - h.attended_count}명</li>)}</ul></details>}
  </section>;
}