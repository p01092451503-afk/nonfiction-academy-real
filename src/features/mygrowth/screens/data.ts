import './copy';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
const rowSchema = z.object({feed_key:z.string(),record_type:z.string(),title:z.string(),detail:z.string().nullable(),occurred_on:z.string(),status:z.string(),planned_minutes:z.number().nullable(),actual_minutes:z.number().nullable(),branch_name:z.string().nullable(),progress:z.number().nullable(),completion_count:z.number().nullable(),training_id:z.string().nullable(),course_id:z.string().nullable(),trainer_name:z.string().nullable(),location:z.string().nullable(),observation:z.string().nullable(),feedback:z.string().nullable(),next_action:z.string().nullable(),plan_id:z.string().nullable(),plan_body:z.string().nullable(),plan_language:z.string().nullable(),plan_updated_at:z.string().nullable(),followup_status:z.string().nullable(),followup_count:z.number()});
export type ScreenRow = z.infer<typeof rowSchema>;
export const kinds = ['offline_training','elearning','field_coaching','manager_coaching'] as const;
export const typeKey: Record<string,string> = {offline_training:'offline',elearning:'elearning',field_coaching:'field',manager_coaching:'manager'};
export function screenStatus(r: ScreenRow) {
 if (r.record_type.endsWith('_coaching') && r.training_id) return !r.plan_id ? 'awaiting' : r.followup_status === 'completed' ? 'checked' : 'followup';
 return ['done','attended'].includes(r.status) ? 'done' : r.status === 'in_progress' ? 'progress' : 'scheduled';
}
export function yearRows(rows: ScreenRow[], year:string) {return rows.filter(r=>r.occurred_on.startsWith(year+'-') && kinds.some(k=>k===r.record_type));}
export function rowPath(r: ScreenRow) {return r.record_type==='elearning' && r.course_id ? `/student/courses/${r.course_id}` : `/my-growth/detail/${encodeURIComponent(r.feed_key)}`;}
export function useGrowthFeed() {
 const {user,profile}=useUser();
 return useQuery({queryKey:['mygrowth-screen',profile?.tenant_id,user?.id],enabled:Boolean(user?.id),staleTime:0,gcTime:0,retry:false,refetchInterval:15000,queryFn:async()=>{
  const {data,error}=await supabase.rpc('mygrowth_employee_feed'); if(error)throw error; return z.array(rowSchema).parse(data);
 }});
}
export function useCapabilities() {
 const {user}=useUser();
 return useQuery({queryKey:['mygrowth-capabilities',user?.id],enabled:Boolean(user?.id),staleTime:0,gcTime:0,retry:false,refetchInterval:15000,queryFn:async()=>{
 const {data,error}=await supabase.rpc('mygrowth_screen_capabilities');if(error)throw error;return z.object({can_appoint:z.boolean(),trainer:z.boolean(),manager:z.boolean(),can_educate:z.boolean()}).parse(data);
 }});
}
