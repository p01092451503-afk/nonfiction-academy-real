import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './copy';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { BarChart3, Download, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QueryState, PendingNotice } from './Shared';
import { useCapabilities } from './data';
import { reportRowSchema, defaultPeriod, type ReportLevel } from './timeReport';
import { downloadReport, prepareReportExport } from './reportExport';

async function loadReport(from: string, to: string, level: ReportLevel) {
  const { data, error } = await supabase.rpc('mygrowth_time_report', { _from: from, _to: to, _level: level });
  if (error) throw error;
  return z.array(reportRowSchema).parse(data);
}

export default function TimeReport() {
  const { t } = useTranslation();
  const label = (l: ReportLevel) => t(`mg.level${l[0].toUpperCase()}${l.slice(1)}`);
  const minutes = (n: number) => { const h = Math.floor(n / 60), m = n % 60; return h ? (m ? t("mg.hoursMinutes", { h, m }) : t("mg.hours", { n: h })) : t("mg.minutes", { n: m }); };
  const { user } = useUser(); const caps = useCapabilities();
  const init = defaultPeriod(new Date());
  const [from, setFrom] = useState(init.from); const [to, setTo] = useState(init.to);
  const [level, setLevel] = useState<ReportLevel>('person');
  const client = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const busy = useRef(false);
  const revision = useRef(0);
  useEffect(() => { revision.current += 1; setExportError(''); return () => { revision.current += 1; }; }, [user?.id, from, to, level]);
  const valid = Boolean(from && to && from <= to);
  const q = useQuery({ queryKey: ['mygrowth-time-report', user?.id, from, to, level], enabled: Boolean(user?.id) && valid, staleTime: 0, gcTime: 0, retry: false,
    queryFn: () => loadReport(from, to, level) });
  async function exportReport() {
    if (busy.current || !user?.id || !valid || q.isFetching || q.isError || !q.data?.length) return;
    busy.current = true; setExporting(true); setExportError('');
    const current = revision.current;
    try {
      const result = await prepareReportExport({ from, to, level }, () => loadReport(from, to, level), () => revision.current === current);
      client.setQueryData(['mygrowth-time-report', user.id, from, to, level], result.rows);
      downloadReport(result.csv, result.filename);
    } catch {
      if (revision.current === current) {
        client.removeQueries({ queryKey: ['mygrowth-time-report', user?.id, from, to, level], exact: true });
        setExportError(t('mg.exportError'));
      }
    } finally { busy.current = false; setExporting(false); }
  }
  const rows = q.data ?? []; const c = caps.data;
  const scope = t(c?.can_appoint ? 'mg.scopeEducation' : c?.trainer || c?.manager ? 'mg.scopeSenior' : 'mg.scopeSelf');
  const total = rows.reduce((a, r) => ({ online: a.online + r.online_minutes, offline: a.offline + r.offline_minutes, field: a.field + r.field_minutes, manager: a.manager + r.manager_minutes }), { online: 0, offline: 0, field: 0, manager: 0 });
  const hidden = rows.some(r => r.manager_hidden);
  return <div className="min-w-0 space-y-6">
    <header className="border-b-2 border-border/80 pb-4"><h1 className="flex items-center gap-2 text-xl sm:text-2xl font-semibold"><BarChart3 className="h-6 w-6"/>{t('mg.reportTitle')}</h1><p className="text-muted-foreground mt-1">{t('mg.reportScope', { scope })}</p></header>
    <div className="grid min-w-0 gap-3 sm:grid-cols-3">
      <label className="min-w-0 text-sm">{t('mg.from')}<Input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="mt-1"/></label>
      <label className="min-w-0 text-sm">{t('mg.to')}<Input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="mt-1"/></label>
      <div className="min-w-0 text-sm">{t('mg.reportLevel')}<Select value={level} onValueChange={v => setLevel(v as ReportLevel)}><SelectTrigger className="mt-1" aria-label={t('mg.reportLevel')}><SelectValue/></SelectTrigger><SelectContent>{(['person','branch','region','global'] as const).map(l => <SelectItem key={l} value={l}>{label(l)}</SelectItem>)}</SelectContent></Select></div>
    </div>
    <div className="flex min-w-0 items-center justify-end gap-3">
      {exporting && <span role="status" className="text-sm text-muted-foreground">{t('mg.exportChecking')}</span>}
      <Tooltip><TooltipTrigger asChild><span><Button variant="outline" size="icon" aria-label={t('mg.exportReport')} disabled={!valid || q.isPending || q.isFetching || q.isError || !rows.length || exporting} onClick={() => void exportReport()}>{exporting ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none"/> : <Download className="h-4 w-4"/>}</Button></span></TooltipTrigger><TooltipContent>{t('mg.exportReport')}</TooltipContent></Tooltip>
    </div>
    {exportError && <p role="alert" className="text-sm text-destructive">{exportError}</p>}
    {!valid ? <p role="alert" className="text-sm text-destructive">{t('mg.invalidPeriod')}</p> : <QueryState query={q}>
      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        {[[t('mg.onlineTime'), total.online], [t('mg.offlineTime'), total.offline], [t('mg.fieldTime'), total.field], [t('mg.managerTime'), total.manager]].map(([k, v]) => <div key={k} className="min-w-0 rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground break-words">{k}</p><p className="mt-2 text-lg font-semibold">{minutes(Number(v))}</p></div>)}
      </div>
      {rows.length === 0 ? <p className="py-10 text-muted-foreground">{t('mg.periodEmpty')}</p> :
      <div className="min-w-0 overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b-2 border-border/80 text-left text-muted-foreground"><th className="py-3 pr-3 font-medium">{label(level)}</th><th className="py-3 pr-3 font-medium">{t('mg.people')}</th><th className="py-3 pr-3 font-medium">{t('mg.online')}</th><th className="py-3 pr-3 font-medium">{t('mg.offline')}</th><th className="py-3 pr-3 font-medium">{t('mg.fieldShort')}</th><th className="py-3 font-medium">{t('mg.manager')}</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.scope_key} className="border-b-2 border-border/80"><td className="py-3 pr-3 break-words">{r.scope_label}</td><td className="py-3 pr-3">{t('mg.peopleCount', { n: r.people })}</td><td className="py-3 pr-3">{minutes(r.online_minutes)}</td><td className="py-3 pr-3">{minutes(r.offline_minutes)}</td><td className="py-3 pr-3">{minutes(r.field_minutes)}</td><td className="py-3">{minutes(r.manager_minutes)}{r.manager_hidden && <span className="ml-1 text-xs text-muted-foreground">{t('mg.hidden')}</span>}</td></tr>)}</tbody></table></div>}
      {hidden && <PendingNotice title={t('mg.customerDecision')} text={t('mg.reportPrivacy')}/>}
      <p className="text-xs text-muted-foreground break-words">{t('mg.reportBasis')}</p>
    </QueryState>}
  </div>;
}
