import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck, UserCog, UserMinus, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

const roles = [{ value: 'trainer', label: '트레이너' }, { value: 'store_manager', label: '스토어매니저' }] as const;

export default function MyGrowthAssignments() {
  const { user } = useUser();
  const client = useQueryClient();
  const [notice, setNotice] = useState('');
  const key = ['mygrowth-assignments', user?.id];
  const query = useQuery({
    queryKey: key, staleTime: 0, gcTime: 0, retry: false, refetchInterval: 15_000,
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const authority = await supabase.rpc('mygrowth_can_appoint');
      if (authority.error) throw authority.error;
      const directory = await supabase.rpc('mygrowth_assignment_directory');
      if (directory.error) throw directory.error;
      return { canAppoint: authority.data === true, rows: directory.data ?? [] };
    },
  });
  const mutation = useMutation({
    mutationFn: async (input: { userId: string; role: string; active: boolean }) => {
      const { error } = await supabase.rpc('mygrowth_set_assignment', {
        _user_id: input.userId, _role: input.role, _active: input.active,
      });
      if (error) throw error;
    },
    onSuccess: async (_, input) => {
      await client.invalidateQueries({ queryKey: key });
      setNotice(input.active ? '담당자를 지정했습니다.' : '담당자 지정을 해제했습니다.');
    },
    onError: () => setNotice('처리하지 못했습니다. 지정 권한과 현재 소속을 다시 확인해 주십시오.'),
  });
  const data = query.isError ? undefined : query.data;
  const staff = [...new Map((data?.rows ?? []).map(row => [row.user_id, row])).values()];
  return <section className="min-w-0 space-y-6">
    <header className="border-b-2 border-border/80 pb-4">
      <h1 className="flex min-w-0 items-center gap-2 text-xl sm:text-2xl font-semibold"><UserCog className="h-6 w-6 shrink-0" />{data?.canAppoint ? '담당자 관리' : '나의 담당 범위'}</h1>
      <p className="text-muted-foreground mt-1">{data?.canAppoint ? '본사 한국 교육팀 · 지점 선임매니저' : '역할과 소속 지점'}</p>
    </header>
    {notice && <p role="status" className="text-sm text-foreground">{notice}</p>}
    {query.isLoading ? <div className="flex min-w-0 items-center gap-2 py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />불러오는 중입니다.</div>
      : query.isError ? <Alert variant="destructive"><AlertDescription>권한과 지정 내역을 확인하지 못했습니다.</AlertDescription><Button variant="outline" className="mt-3" onClick={() => void query.refetch()}>다시 확인</Button></Alert>
      : <>
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0" />담당 범위: 본인 소속 지점</div>
        {staff.length === 0 ? <p className="py-12 text-sm text-muted-foreground">{data?.canAppoint ? '지정 가능한 선임매니저가 없습니다.' : '현재 지정된 담당 역할이 없습니다.'}</p>
          : <ul className="min-w-0">
            {staff.map(person => <li key={person.user_id} className="border-b-2 border-border/80 py-5 flex min-w-0 flex-col lg:flex-row lg:items-center gap-4">
              <div className="min-w-0 flex-1"><h2 className="font-semibold break-words">{person.full_name}</h2><p className="text-sm text-muted-foreground mt-1 break-words">{person.branch_name} · 선임매니저</p></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0 lg:w-[420px]">
                {roles.map(role => {
                  const assigned = data?.rows.find(row => row.user_id === person.user_id && row.role === role.value);
                  return <div key={role.value} className="min-w-0 flex items-center justify-between gap-2">
                    <span className="text-sm">{role.label}<span className="block text-xs text-muted-foreground mt-1">{assigned ? '지정됨' : '미지정'}</span></span>
                    {data?.canAppoint && <Button size="sm" variant={assigned ? 'outline' : 'default'} disabled={mutation.isPending || query.isFetching} aria-label={`${person.full_name} ${role.label} ${assigned ? '해제' : '지정'}`} onClick={() => { setNotice(''); mutation.mutate({ userId: person.user_id, role: role.value, active: !assigned }); }}>{mutation.isPending && mutation.variables?.userId === person.user_id && mutation.variables.role === role.value ? <Loader2 className="h-4 w-4 animate-spin" /> : assigned ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}{assigned ? '해제' : '지정'}</Button>}
                  </div>;
                })}
              </div>
            </li>)}
          </ul>}
      </>}
  </section>;
}