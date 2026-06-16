import { supabase } from "@/integrations/supabase/client";

/**
 * 비즈니스 규칙:
 * - 1개 강의는 다국어 버전(KO/EN/ZH/JA 등) 차시들로 구성된다.
 * - 모든 차시는 동일한 콘텐츠의 다른 언어 버전이므로,
 *   학습자가 어떤 언어로든 한 차시(또는 그 차시의 모든 하위 항목)를
 *   완료하면 강의 전체가 학습완료(100%)로 처리된다.
 *
 * 진도율 계산 정책:
 *   - 학생이 어떤 차시(다국어 버전 중 하나)의 하위 항목들을 부분
 *     시청한 경우에도 진도율이 즉시 반영되어야 한다.
 *   - 따라서 차시 단위로 저장된 progress_percentage 중 가장 높은
 *     값을 강의 전체 진도율로 사용한다. (한 차시만 끝나도 100%)
 *   - 어느 한 차시라도 completed=true 면 isCompleted=true.
 */

export function computeCourseProgress(
  contents: Array<{ id: string }>,
  progressData: Array<{
    content_id: string;
    completed: boolean | null;
    progress_percentage?: number | null;
  }>,
): { percentage: number; isCompleted: boolean } {
  if (!contents || contents.length === 0) {
    return { percentage: 0, isCompleted: false };
  }
  const contentIds = new Set(contents.map((c) => c.id));
  const relevant = (progressData || []).filter((p) => contentIds.has(p.content_id));
  const anyCompleted = relevant.some((p) => p.completed);
  if (anyCompleted) {
    return { percentage: 100, isCompleted: true };
  }
  const maxPct = relevant.reduce((max, p) => {
    const pct = Number(p.progress_percentage) || 0;
    return pct > max ? pct : max;
  }, 0);
  const clamped = Math.max(0, Math.min(99, Math.round(maxPct)));
  return { percentage: clamped, isCompleted: false };
}

/**
 * 한 차시가 완료된 시점에 호출.
 * 강의에 게시된 평가가 있으면, 사용자가 해당 평가에 합격(passed=true)했을 때만
 * 이수 완료(completed_at)로 처리한다. 미합격 시 진행률만 99로 유지한다.
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

  // 강의에 게시된 평가가 있는지 확인
  const { data: assessments } = await supabase
    .from("assessments")
    .select("id")
    .eq("course_id", courseId)
    .eq("is_published", true);
  const hasAssessment = (assessments?.length ?? 0) > 0;

  if (hasAssessment) {
    const assessmentIds = (assessments || []).map((a: any) => a.id);
    const { data: passedAttempts } = await supabase
      .from("assessment_attempts")
      .select("id")
      .eq("user_id", userId)
      .in("assessment_id", assessmentIds)
      .eq("passed", true)
      .limit(1);

    if (!passedAttempts || passedAttempts.length === 0) {
      // 평가 미합격 → 이수 완료 처리 보류, 진행률만 99로 유지
      await supabase
        .from("enrollments")
        .update({ progress: 99 })
        .eq("id", enrollment.id);
      return;
    }
  }

  await supabase
    .from("enrollments")
    .update({
      progress: 100,
      completed_at: new Date().toISOString(),
    })
    .eq("id", enrollment.id);
}

/**
 * 차시(content)가 부분 완료된 경우에도 enrollment.progress 를 갱신해
 * 학생 목록/대시보드의 강의 진행률에 즉시 반영되도록 한다.
 * - 이미 완료 처리된 enrollment 는 건드리지 않는다.
 * - 강의에 속한 모든 content_progress 중 가장 큰 progress_percentage 를
 *   취해 enrollment.progress 로 동기화 (감소 X).
 */
export async function syncEnrollmentPartialProgress(params: {
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
  if (!enrollment || enrollment.completed_at) return;

  const { data: contents } = await supabase
    .from("course_contents")
    .select("id")
    .eq("course_id", courseId);
  const contentIds = (contents || []).map((c: any) => c.id);
  if (contentIds.length === 0) return;

  const { data: progressRows } = await supabase
    .from("content_progress")
    .select("progress_percentage, completed")
    .eq("user_id", userId)
    .in("content_id", contentIds);

  const maxPct = (progressRows || []).reduce((max, p: any) => {
    if (p.completed) return 100;
    const pct = Number(p.progress_percentage) || 0;
    return pct > max ? pct : max;
  }, 0);

  const next = Math.max(0, Math.min(99, Math.round(maxPct)));
  if (next > (enrollment.progress ?? 0)) {
    await supabase.from("enrollments").update({ progress: next }).eq("id", enrollment.id);
  }
}
