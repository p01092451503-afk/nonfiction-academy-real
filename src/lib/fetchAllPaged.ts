// Supabase 기본 1000행 제한을 우회하는 페이지네이션 헬퍼.
// 사용 예:
//   const rows = await fetchAllPaged((from, to) =>
//     supabase.from("enrollments").select("id, user_id, course_id").range(from, to)
//   );
export async function fetchAllPaged<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // 안전장치: 최대 50페이지(50,000행)
  for (let i = 0; i < 50; i++) {
    const { data, error } = await query(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
