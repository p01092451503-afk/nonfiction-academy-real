import { supabase } from "@/integrations/supabase/client";

/**
 * 비즈니스 규칙:
 * - 1개 강의는 다국어 버전(KO/EN/ZH/JA 등) 차시들로 구성된다.
 * - 모든 차시는 동일한 콘텐츠의 다른 언어 버전이므로,
 *   학습자가 어떤 언어로든 첫 차시(또는 어느 한 차시)를 완료하면
 *   강의 전체가 학습완료로 처리된다.
 *
 * 진도율 계산 정책:
 *   - 어느 한 차시라도 완료 → 100%
 *   - 그 외 → 0%
 */

export function computeCourseProgress(
  contents: Array<{ id: string }>,
  progressData: Array<{ content_id: string; completed: boolean | null }>,
): { percentage: number; isCompleted: boolean } {
  if (!contents || contents.length === 0) {
    return { percentage: 0, isCompleted: false };
  }
  const contentIds = new Set(contents.map((c) => c.id));
  const anyCompleted = (progressData || []).some(
    (p) => p.completed && contentIds.has(p.content_id),
  );
  return {
    percentage: anyCompleted ? 100 : 0,
    isCompleted: anyCompleted,
  };
}

/**
 * 한 차시가 완료된 시점에 호출.
 * 같은 강의의 enrollment.progress / completed_at 을 갱신한다.
 */
export async function syncEnrollmentOnContentCompleted(params: {
  userId: string;
  courseId: string;
}) {
  const { userId, courseId } = params;
  if (!userId || !courseId) return;

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, completed_at, progress")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (!enrollment) return;
  if (enrollment.completed_at) return; // 이미 완료됨

  await supabase
    .from("enrollments")
    .update({
      progress: 100,
      completed_at: new Date().toISOString(),
    })
    .eq("id", enrollment.id);
}
