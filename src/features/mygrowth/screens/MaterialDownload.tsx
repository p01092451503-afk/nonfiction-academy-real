import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Download, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Header } from './Shared';

export default function MaterialDownload() {
  const { ticket } = useParams(); const [params] = useSearchParams();
  const [blob, setBlob] = useState<Blob>(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const name = params.get('name') ?? '교육자료';
  async function prepare() {
    if (!ticket) return; setBusy(true); setError(''); setBlob(undefined);
    try { const { data, error: failed } = await supabase.functions.invoke('mygrowth-materials', { body: { ticket } }); if (failed || !(data instanceof Blob)) throw new Error(); setBlob(data); }
    catch { setError('링크가 만료됐거나 현재 참석·소속·담당 권한이 없습니다. 원래 교육 상세에서 다시 확인하십시오.'); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!blob) return;
    const file = new File([blob], name, { type: blob.type });
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; }
      catch (e) { if (e instanceof DOMException && e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); setBlob(undefined);
  }
  return <section className="min-w-0 space-y-6"><Header title="교육자료 내려받기" back="/my-growth/learning"/><h2 className="flex min-w-0 gap-2 break-words font-semibold"><FileText className="h-5 w-5 shrink-0"/>{name}</h2><p className="text-sm text-muted-foreground">링크 유효기간은 발급 후 일주일입니다.</p>{error && <p role="alert" className="break-words text-sm">{error}</p>}<Button disabled={busy} onClick={() => void (blob ? save() : prepare())}><Download className="h-4 w-4"/>{busy ? '파일 확인 중' : blob ? '파일 저장' : '파일 확인'}</Button></section>;
}