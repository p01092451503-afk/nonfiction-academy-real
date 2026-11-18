import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { Switch } from '@/components/ui/switch';
import { k } from '../uiText';

const stateSchema = z.object({ enabled: z.boolean(), updated_at: z.string().nullable(), updated_by: z.string().nullable() });

/** HQ education team toggle; the server re-checks authority on every read and write. */
export default function HqVisibilitySetting() {
  const { user } = useUser(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['mygrowth-hq-visibility', user?.id], enabled: Boolean(user?.id), staleTime: 0, gcTime: 0, retry: false,
    queryFn: async () => { const { data, error } = await supabase.rpc('mygrowth_hq_visibility_state'); if (error) throw error; return stateSchema.parse(data); } });
  const m = useMutation({
    mutationFn: async (enabled: boolean) => { const { error } = await supabase.rpc('mygrowth_set_hq_visibility', { _enabled: enabled }); if (error) throw error; },
    onSettled: () => { for (const key of ['mygrowth-hq-visibility', 'mygrowth-capabilities', 'mygrowth-team-summary', 'mygrowth-staff-directory', 'mygrowth-staff-feed']) qc.invalidateQueries({ queryKey: [key] }); },
  });
  if (q.isError) return null;
  const on = Boolean(q.data?.enabled);
  return <div className="flex min-w-0 items-start gap-3 rounded-lg border border-border p-4">
    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"/>
    <div className="min-w-0 flex-1">
      <label htmlFor="mg-hq-visibility" className="font-semibold">{k("본사 교육팀 직원 상세·매니저 코칭 공개")}</label>
      <p className="mt-1 text-sm text-muted-foreground">{on ? k("켜면 본사 교육팀이 모든 지점 직원의 상세 기록과 매니저 코칭 원문·실행 계획·후속 판정 이력을 읽을 수 있습니다. 판정 작성은 지점 담당자만 할 수 있습니다.") : k("끄면 매니저 코칭 원문은 작성한 매니저 본인만 볼 수 있습니다.")}</p>
      {m.isError && <p role="alert" className="mt-2 text-sm text-destructive">{k("설정을 바꾸지 못했습니다. 다시 시도해 주세요.")}</p>}
    </div>
    <div className="flex shrink-0 items-center gap-2"><span className="text-sm text-muted-foreground">{on ? k("공개 중") : k("비공개")}</span>
      <Switch id="mg-hq-visibility" checked={on} disabled={!q.isSuccess || m.isPending} onCheckedChange={v => m.mutate(v)}/></div>
  </div>;
}
