export interface LearningRow {
  feed_key: string; record_type: string; title: string; detail: string | null;
  occurred_on: string; status: string; planned_minutes: number | null;
  actual_minutes: number | null; branch_name: string | null;
  progress: number | null; completion_count: number | null;
}
export type LearningCategory = 'all' | 'education' | 'coaching' | 'growth';
export function learningCategory(type: string): Exclude<LearningCategory, 'all'> {
  if (type === 'elearning' || type === 'offline_training') return 'education';
  if (['coaching', 'field_coaching', 'manager_coaching'].includes(type)) return 'coaching';
  return 'growth';
}
export function filterLearning(rows: LearningRow[], filters: { search: string; category: LearningCategory; status: string; from: string; to: string }) {
  const search = filters.search.trim().toLocaleLowerCase();
  return rows.filter(r => r.title.toLocaleLowerCase().includes(search) &&
    (filters.category === 'all' || learningCategory(r.record_type) === filters.category) &&
    (filters.status === 'all' || (filters.status === 'done' ? ['done', 'attended'].includes(r.status) : r.status === filters.status)) &&
    (!filters.from || r.occurred_on >= filters.from) && (!filters.to || r.occurred_on <= filters.to));
}