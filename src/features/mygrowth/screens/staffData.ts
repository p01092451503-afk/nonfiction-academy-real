import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { rowSchema, type ScreenRow } from './data';

const directorySchema = z.array(z.object({ user_id: z.string(), full_name: z.string(), branch_name: z.string() }));
export function attendanceLabel(row: ScreenRow) {
  return row.status === 'attended' ? '참석' : row.status === 'absent' ? '미참석' : '참석 확인 전';
}
export function completedAttendance(rows: ScreenRow[]) { return rows.filter(r => r.status === 'attended'); }
export function useStaffDirectory() {
  const { user } = useUser();
  return useQuery({ queryKey: ['mygrowth-staff-directory', user?.id], enabled: Boolean(user?.id), staleTime: 0, gcTime: 0, retry: false, refetchInterval: 15000,
    queryFn: async () => { const { data, error } = await supabase.rpc('mygrowth_staff_directory'); if (error) throw error; return directorySchema.parse(data); } });
}
export function useStaffFeed(employee?: string, training?: string) {
  const { user } = useUser();
  return useQuery({ queryKey: ['mygrowth-staff-feed', user?.id, employee, training], enabled: Boolean(user?.id && employee), staleTime: 0, gcTime: 0, retry: false, refetchInterval: 15000,
    queryFn: async () => {
      if (!employee) throw new Error('직원을 선택해 주십시오.');
      if (training) { const { data, error } = await supabase.rpc('mygrowth_staff_detail', { _employee: employee, _training: training }); if (error) throw error; return [rowSchema.parse(data)]; }
      const { data, error } = await supabase.rpc('mygrowth_staff_feed', { _employee: employee }); if (error) throw error; return z.array(rowSchema).parse(data);
    } });
}