import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Loader2, Plus, Save, Search, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import TrainingAttendance from '../components/TrainingAttendance';

const blank = () => ({ requestId: crypto.randomUUID(), branch: '', trainer: '', title: '', type: '', date: '', location: '', planned: '', actual: '', summary: '', targets: [] as string[] });

export default function MyGrowthTraining() {
  const { user } = useUser();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [form, setForm] = useState(blank);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const key = ['mygrowth-training', user?.id];
  const query = useQuery({ queryKey: key, enabled: Boolean(user?.id), staleTime: 0, gcTime: 0, retry: false, refetchInterval: 15_000, queryFn: async () => {
    const directory = await supabase.rpc('mygrowth_training_directory');
    if (directory.error) throw directory.error;
    const list = await supabase.rpc('mygrowth_training_list');
    if (list.error) throw list.error;
    return { staff: directory.data ?? [], list: list.data ?? [] };
  }});
  const save = useMutation({ mutationFn: async () => {
    const { data, error } = await supabase.rpc('mygrowth_create_training', { _request_id: form.requestId, _branch_id: form.branch, _trainer_id: form.trainer, _title: form.title, _training_type: form.type, _training_date: form.date, _location: form.location, _planned_minutes: Number(form.planned), _actual_minutes: form.actual === '' ? null : Number(form.actual), _summary: form.summary, _target_ids: form.targets });
    if (error) throw error;
    return data;
  }, onSuccess: async id => { await client.invalidateQueries({ queryKey: key }); setSelected(id); setEditing(false); setForm(blank()); setNotice('교육과 참석 대상을 저장했습니다.'); }, onError: () => setNotice('저장하지 못했습니다. 현재 담당 범위와 입력을 확인한 뒤 다시 저장해 주십시오.') });
  const data = query.isError ? undefined : query.data;
  const trainers = (data?.staff ?? []).filter(s => s.is_trainer);
  const branches = [...new Map(trainers.map(s => [s.branch_id, s])).values()];
  const staff = (data?.staff ?? []).filter(s => s.branch_id === form.branch);
  const filtered = staff.filter(s => s.full_name.includes(search.trim()));
  const detail = data?.list.find(t => t.id === selected);
  const field = (name: 'title'|'type'|'date'|'location'|'planned'|'actual', label: string, type = 'text', required = true) => <div className="min-w-0 space-y-2"><Label htmlFor={`training-${name}`}>{label}</Label><Input id={`training-${name}`} type={type} required={required} min={name === 'planned' ? 1 : 0} step={type === 'number' ? 1 : undefined} value={form[name]} onChange={e => setForm({ ...form, [name]: e.target.value })} /></div>;
  return <section className="min-w-0 space-y-6">
    <header className="border-b-2 border-border/80 pb-4 flex min-w-0 flex-wrap items-center justify-between gap-4"><div className="min-w-0"><h1 className="flex min-w-0 items-center gap-2 text-xl sm:text-2xl font-semibold"><GraduationCap className="h-6 w-6 shrink-0" />오프라인 교육</h1><p className="text-muted-foreground mt-1">대면 교육 · 참석 관리</p></div>{!editing && !selected && trainers.length > 0 && <Button onClick={() => { setEditing(true); setNotice(''); setForm(blank()); setSearch(''); }}><Plus className="h-4 w-4" />교육 등록</Button>}</header>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {query.isLoading ? <p className="flex min-w-0 items-center gap-2 py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />불러오는 중입니다.</p> : query.isError ? <div role="alert"><p>교육과 담당 범위를 확인하지 못했습니다.</p><Button variant="outline" onClick={() => void query.refetch()}>다시 확인</Button></div> : editing ? <form className="space-y-8" onSubmit={e => { e.preventDefault(); setNotice(''); save.mutate(); }}>
      <fieldset disabled={save.isPending || query.isFetching} className="space-y-8 min-w-0">
        <div className="grid sm:grid-cols-2 gap-5 min-w-0">
          {field('title', '교육 제목')}{field('type', '교육 유형')}
          <div className="space-y-2 min-w-0"><Label htmlFor="training-branch">지점</Label><select id="training-branch" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.branch} onChange={e => { setForm({ ...form, branch: e.target.value, trainer: '', targets: [] }); setSearch(''); }}><option value="">지점 선택</option>{branches.map(s => <option key={s.branch_id} value={s.branch_id}>{s.branch_name}</option>)}</select></div>
          <div className="space-y-2 min-w-0"><Label htmlFor="training-trainer">교육 담당자</Label><select id="training-trainer" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.trainer} onChange={e => setForm({ ...form, trainer: e.target.value })}><option value="">담당자 선택</option>{trainers.filter(s => s.branch_id === form.branch).map(s => <option key={s.user_id} value={s.user_id}>{s.full_name}</option>)}</select></div>
          {field('date', '교육 일자', 'date')}{field('location', '교육 장소')}{field('planned', '계획 시간 (분)', 'number')}{field('actual', '실제 시간 (분) · 선택', 'number', false)}
        </div>
        <div className="space-y-2"><Label htmlFor="training-summary">교육 핵심 정리 · 선택</Label><Textarea id="training-summary" value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} rows={4} /></div>
        <div className="space-y-4 min-w-0"><div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">참석 대상 <span className="text-muted-foreground">{form.targets.length}명 선택</span></h2><Button type="button" variant="outline" disabled={!filtered.length} onClick={() => setForm({ ...form, targets: [...new Set([...form.targets, ...filtered.map(s => s.user_id)])] })}>검색 결과 전체 선택</Button></div><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="참석 직원 검색" placeholder="직원 이름 검색" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
          {!form.branch ? <p className="text-sm text-muted-foreground py-4">지점을 선택해 주십시오.</p> : filtered.length === 0 ? <p className="text-sm text-muted-foreground py-4">해당 직원이 없습니다.</p> : <ul>{filtered.map(s => <li key={s.user_id} className="border-b-2 border-border/80 py-4"><label className="flex min-w-0 items-center gap-3 cursor-pointer"><Checkbox aria-label={`${s.full_name} 선택`} checked={form.targets.includes(s.user_id)} onCheckedChange={checked => setForm({ ...form, targets: checked ? [...new Set([...form.targets, s.user_id])] : form.targets.filter(id => id !== s.user_id) })} /><span className="min-w-0 break-words">{s.full_name}</span></label></li>)}</ul>}
        </div>
      </fieldset><div className="flex min-w-0 justify-end gap-3"><Button type="button" variant="outline" disabled={save.isPending} onClick={() => setEditing(false)}>취소</Button><Button type="submit" disabled={save.isPending || query.isFetching || form.targets.length === 0}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}교육 저장</Button></div>
    </form> : selected ? <div className="space-y-6"><Button variant="ghost" onClick={() => setSelected(undefined)}><ArrowLeft className="h-4 w-4" />교육 목록</Button>{!detail ? <p>교육을 확인할 수 없습니다.</p> : <><h2 className="text-xl font-semibold break-words">{detail.title}</h2><dl className="grid sm:grid-cols-2 gap-5">{[['교육 유형', detail.training_type], ['일자', detail.training_date], ['지점', detail.branch_name], ['장소', detail.location], ['담당자', detail.trainer_name], ['계획 시간', `${detail.planned_minutes}분`], ['실제 시간', detail.actual_minutes === null ? '미기록' : `${detail.actual_minutes}분`]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}</dl>{detail.summary && <div><h3 className="font-semibold">교육 핵심 정리</h3><p className="whitespace-pre-wrap break-words mt-2">{detail.summary}</p></div>}<TrainingAttendance key={selected} trainingId={selected} /></>}</div> : data?.list.length === 0 ? <p className="py-12 text-muted-foreground">등록된 교육이 없습니다.</p> : <ul>{data?.list.map(t => <li key={t.id} className="border-b-2 border-border/80 py-5 flex min-w-0 flex-wrap items-center justify-between gap-3"><div className="min-w-0 flex-1"><h2 className="font-semibold break-words">{t.title}</h2><p className="text-sm text-muted-foreground mt-1 break-words">{t.training_date} · {t.branch_name} · {t.trainer_name} · 참석 대상 {t.target_count}명</p></div><Button variant="outline" onClick={() => { setSelected(t.id); setNotice(''); }}>상세 보기</Button></li>)}</ul>}
  </section>;
}