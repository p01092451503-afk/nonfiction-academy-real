import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, GraduationCap, Users, Target, Loader2, Search, RotateCcw, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/contexts/UserContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { filterLearning, learningCategory, type LearningCategory, type LearningRow } from '../learning';

const TYPES: Record<string, string> = { elearning: '이러닝', offline_training: '오프라인 교육', coaching: '코칭', field_coaching: '필드 코칭', manager_coaching: '매니저 코칭', plan: '실행 계획', followup: '후속 확인' };
const STATUSES: Record<string, string> = { done: '완료', attended: '참석 확인', in_progress: '진행 중', scheduled: '예정' };
const blank = { search: '', category: 'all' as LearningCategory, status: 'all', from: '', to: '' };
const minutes = (value: number | null) => value === null ? '미기록' : `${value}분`;

export default function MyGrowthLearning() {
  const { user } = useUser();
  const [filters, setFilters] = useState(blank);
  const [selected, setSelected] = useState<string>();
  const query = useQuery({ queryKey: ['mygrowth-learning', user?.id], enabled: Boolean(user?.id), staleTime: 0, gcTime: 0, retry: false, refetchInterval: 15_000, queryFn: async (): Promise<LearningRow[]> => {
    const { data, error } = await supabase.rpc('mygrowth_learning_list');
    if (error) throw error;
    return data ?? [];
  }});
  const rows = query.isError ? [] : query.data ?? [];
  const invalidDates = Boolean(filters.from && filters.to && filters.from > filters.to);
  const filtered = invalidDates ? [] : filterLearning(rows, filters);
  const detail = rows.find(r => r.feed_key === selected);
  const counts = [{ label: '교육', category: 'education', icon: GraduationCap }, { label: '코칭', category: 'coaching', icon: Users }, { label: '성장 활동', category: 'growth', icon: Target }];
  return <section className="min-w-0 space-y-6">
    <header className="border-b-2 border-border/80 pb-4"><h1 className="flex min-w-0 items-center gap-2 text-xl sm:text-2xl font-semibold"><BookOpen className="h-6 w-6 shrink-0" />나의 학습 목록</h1><p className="text-muted-foreground mt-1">나의 교육 · 코칭 · 성장 활동</p></header>
    <dl className="grid grid-cols-3 min-w-0 gap-3 border-b-2 border-border/80 pb-6">{counts.map(c => <div key={c.category} className="min-w-0"><dt className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"><c.icon className="h-4 w-4 shrink-0" />{c.label}</dt><dd className="mt-2 text-2xl font-semibold">{query.isPending || query.isError ? '—' : rows.filter(r => learningCategory(r.record_type) === c.category).length}<span className="ml-1 text-sm font-normal text-muted-foreground">건</span></dd></div>)}</dl>
    <div className="min-w-0 space-y-4">
      <Tabs value={filters.category} onValueChange={value => setFilters({ ...filters, category: value as LearningCategory })}><TabsList className="grid w-full sm:w-96 grid-cols-4"><TabsTrigger value="all">전체</TabsTrigger><TabsTrigger value="education">교육</TabsTrigger><TabsTrigger value="coaching">코칭</TabsTrigger><TabsTrigger value="growth">성장 활동</TabsTrigger></TabsList></Tabs>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2 min-w-0"><Label htmlFor="learning-search">제목 검색</Label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="learning-search" placeholder="기록 제목 검색" className="pl-9" value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} /></div></div>
        <div className="space-y-2 min-w-0"><Label htmlFor="learning-status">상태</Label><select id="learning-status" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="all">모든 상태</option><option value="done">완료 · 참석 확인</option><option value="in_progress">진행 중</option><option value="scheduled">예정</option></select></div>
        <div className="space-y-2 min-w-0"><Label htmlFor="learning-from">시작일</Label><Input id="learning-from" type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></div>
        <div className="space-y-2 min-w-0"><Label htmlFor="learning-to">종료일</Label><Input id="learning-to" type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></div>
      </div>
      <div className="flex min-w-0 justify-between items-center gap-3"><p className="text-sm text-muted-foreground" aria-live="polite">{query.isPending ? '불러오는 중' : query.isError ? '조회 실패' : `전체 ${rows.length}건 · 조회 ${filtered.length}건`}</p><Button variant="ghost" onClick={() => setFilters(blank)}><RotateCcw className="h-4 w-4" />초기화</Button></div>
    </div>
    {invalidDates && <p role="alert" className="text-sm text-destructive">종료일을 시작일 이후로 선택해 주십시오.</p>}
    {query.isPending ? <p className="flex min-w-0 gap-2 items-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />학습 기록을 불러오는 중입니다.</p> : query.isError ? <div role="alert" className="space-y-3 py-8"><p>학습 기록을 확인하지 못했습니다.</p><Button variant="outline" onClick={() => void query.refetch()}>다시 확인</Button></div> : rows.length === 0 ? <p className="py-12 text-muted-foreground">등록된 나의 학습 기록이 없습니다.</p> : filtered.length === 0 ? <p className="py-12 text-muted-foreground">조건에 맞는 기록이 없습니다.</p> : <ul>{filtered.map(r => <li key={r.feed_key} className="flex min-w-0 flex-wrap items-center gap-4 py-5 border-b-2 border-border/80"><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{TYPES[r.record_type] ?? '성장 기록'} · {r.occurred_on}</p><h2 className="mt-2 font-semibold break-words">{r.title}</h2>{r.branch_name && <p className="text-sm text-muted-foreground mt-1 break-words">{r.branch_name}</p>}{r.progress !== null && <p className="text-sm text-muted-foreground mt-1">진도 {Math.round(r.progress)}% · 수료 {r.completion_count ?? 0}회</p>}</div><div className="flex min-w-0 items-center gap-2"><span className={`text-sm ${['done', 'attended'].includes(r.status) ? 'text-success' : 'text-muted-foreground'}`}>{STATUSES[r.status] ?? '미기록'}</span><Button variant="ghost" aria-label={`${r.title} 상세 보기`} onClick={() => setSelected(r.feed_key)}>상세 보기<ChevronRight className="h-4 w-4" /></Button></div></li>)}</ul>}
    <Dialog open={Boolean(selected && detail)} onOpenChange={open => { if (!open) setSelected(undefined); }}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle className="break-words leading-relaxed">{detail?.title}</DialogTitle></DialogHeader>{detail && <div className="space-y-5 min-w-0"><dl className="grid grid-cols-2 gap-4 min-w-0">{[['유형', TYPES[detail.record_type] ?? '성장 기록'], ['상태', STATUSES[detail.status] ?? '미기록'], ['일자', detail.occurred_on], ['지점', detail.branch_name ?? '미기록'], ['계획 시간', minutes(detail.planned_minutes)], ['실제 시간', minutes(detail.actual_minutes)], ...(detail.progress === null ? [] : [['진도', `${Math.round(detail.progress)}%`], ['수료 횟수', `${detail.completion_count ?? 0}회`]])].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}</dl><div><h3 className="font-semibold">기록 내용</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm">{detail.detail || '등록된 상세 내용이 없습니다.'}</p></div></div>}</DialogContent></Dialog>
  </section>;
}