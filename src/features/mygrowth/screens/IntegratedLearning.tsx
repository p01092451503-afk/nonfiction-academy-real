import { Link } from 'react-router-dom';
import { Play, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { type ScreenRow } from './data';

export function continuingLearning(rows: ScreenRow[]) {
  return rows.filter(row => row.record_type === 'elearning' && row.status === 'in_progress' && Boolean(row.course_id));
}
export function learningDetailPath(row: ScreenRow) {
  return `/my-growth/detail/${encodeURIComponent(row.feed_key)}`;
}
export function ContinueLearning({ rows }: { rows: ScreenRow[] }) {
  const { t } = useTranslation();
  const learning = continuingLearning(rows);
  return <section className="min-w-0 space-y-4" aria-label="이어서 학습">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{t('dashboard.ongoingCourses', '수강 중인 강의')}</h2><Button asChild variant="ghost" size="sm"><Link to="/my-growth/learning">내 강의<ChevronRight className="h-4 w-4"/></Link></Button></div>
    {learning.length ? <ul className="min-w-0">{learning.map(row => <li key={row.feed_key} className="min-w-0 space-y-3 border-b-2 border-border/80 py-5">
      <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="min-w-0"><h3 className="font-semibold break-words">{row.title}</h3><p className="mt-1 text-xs text-muted-foreground">이러닝</p></div><Button asChild variant="outline" className="shrink-0"><Link to={learningDetailPath(row)} aria-label={`${row.title} 이어서 학습`}><Play className="h-4 w-4"/>이어서 학습</Link></Button></div>
      <div className="flex min-w-0 items-center gap-3"><Progress value={row.progress ?? 0} className="h-2 flex-1" aria-label={`${row.title} 진행률`}/><span className="shrink-0 text-sm">{row.progress ?? 0}%</span></div>
    </li>)}</ul> : <p className="py-4 text-sm text-muted-foreground">수강 중인 온라인 강의가 없습니다.</p>}
  </section>;
}