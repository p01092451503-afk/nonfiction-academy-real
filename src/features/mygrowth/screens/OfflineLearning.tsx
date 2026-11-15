import { useGrowthFeed } from './data';
import { QueryState, RecordList } from './Shared';

export default function OfflineLearning() {
  const query = useGrowthFeed();
  return <section className="min-w-0 space-y-4" aria-label="오프라인 교육 목록">
    <h2 className="text-lg font-semibold">오프라인 교육</h2>
    <QueryState query={query}><RecordList rows={query.isError ? [] : (query.data ?? []).filter(row => row.record_type === 'offline_training')} dated /></QueryState>
  </section>;
}