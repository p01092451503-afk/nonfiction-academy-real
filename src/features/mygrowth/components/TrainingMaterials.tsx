import { k } from '../uiText';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Download, FileText, Upload, Loader2 } from 'lucide-react';
import { useUser } from '@/contexts/UserContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
const filesSchema = z.array(z.object({ id: z.string(), filename: z.string(), bytes: z.number(), created_at: z.string() }));
export default function TrainingMaterials({ trainingId, editable = false }: { trainingId: string; editable?: boolean }) {
  const { user } = useUser(); const client = useQueryClient(); const navigate = useNavigate();
  const [file, setFile] = useState<File>(); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const key = ['mygrowth-materials', user?.id, trainingId];
  const query = useQuery({ queryKey: key, enabled: Boolean(user?.id), staleTime: 0, gcTime: 0, retry: false, refetchInterval: 15000, queryFn: async () => {
    const { data, error } = await supabase.rpc('mygrowth_material_list', { _training: trainingId }); if (error) throw error; return filesSchema.parse(data);
  }});
  async function upload() {
    if (!file || busy) return;
    setBusy(true); setNotice('');
    try {
      if (!/\.(docx?|pdf|xlsx?|pptx?)$/i.test(file.name) || file.size < 1 || file.size > 50 * 1024 * 1024) throw new Error();
      const body = new FormData(); body.append('file', file); body.append('training', trainingId);
      const { error } = await supabase.functions.invoke('mygrowth-materials', { body }); if (error) throw error;
      setFile(undefined); setNotice(k("교육자료를 등록했습니다.")); await client.invalidateQueries({ queryKey: key });
    } catch { setNotice(k("등록하지 못했습니다. 담당 범위, 실제 문서 형식과 파일당 50MB 이하 용량을 확인하십시오.")); }
    finally { setBusy(false); }
  }
  async function download(id: string, filename: string) {
    if (busy) return; setBusy(true); setNotice('');
    try {
      const { data: ticket, error } = await supabase.rpc('mygrowth_material_issue', { _material: id }); if (error || !ticket) throw error;
      navigate(`/my-growth/material-download/${ticket}?name=${encodeURIComponent(filename)}`);
    } catch { setNotice(k("파일을 내려받지 못했습니다. 현재 참석·소속·담당 권한을 다시 확인하십시오.")); }
    finally { setBusy(false); }
  }
  return <section aria-label={k("교육자료")} className="min-w-0 space-y-4 border-t border-border pt-5">
    <h3 className="flex min-w-0 items-center gap-2 font-semibold"><FileText className="h-5 w-5 shrink-0"/>{k("교육자료")}</h3>
    {notice && <p role="status" className="text-sm break-words">{notice}</p>}
    {query.isPending ? <p className="text-sm text-muted-foreground">{k("자료를 불러오는 중입니다.")}</p> : query.isError ? <div role="alert" className="space-y-2"><p>{k("교육자료와 열람 권한을 확인하지 못했습니다.")}</p><Button variant="outline" onClick={() => void query.refetch()}>{k("다시 확인")}</Button></div> : <>
      {query.data.length ? <ul>{query.data.map(item => <li key={item.id} className="flex min-w-0 flex-wrap items-center gap-3 border-b-2 border-border/80 py-4"><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{item.filename}</p><p className="mt-1 text-xs text-muted-foreground">{(item.bytes / 1024 / 1024).toFixed(2)}MB</p></div><Button variant="outline" disabled={busy} aria-label={k('{{name}} 내려받기',{name:item.filename})} onClick={() => void download(item.id, item.filename)}><Download className="h-4 w-4"/>{k("내려받기")}</Button></li>)}</ul> : <p className="text-sm text-muted-foreground">{k("등록된 교육자료가 없습니다.")}</p>}
      {editable && <div className="min-w-0 space-y-3"><Label htmlFor={`material-${trainingId}`}>{k("워드·PDF·엑셀·PPT · 파일당 최대 50MB")}</Label><Input id={`material-${trainingId}`} type="file" accept=".doc,.docx,.pdf,.xls,.xlsx,.ppt,.pptx" disabled={busy} onChange={e => setFile(e.target.files?.[0])}/><Button disabled={busy || !file} onClick={() => void upload()}>{busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none"/> : <Upload className="h-4 w-4"/>}{k("자료 등록")}</Button></div>}
    </>}
  </section>;
}