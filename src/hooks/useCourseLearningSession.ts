import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";

/**
 * 강의 학습 세션 트래커
 * - 학습자가 강의 상세 페이지에 진입하면 새 세션을 생성합니다 (started_at = now).
 * - 1분마다 heartbeat 로 last_heartbeat_at 을 갱신하되 started_at + 30분을 초과하면 멈춥니다.
 * - 페이지 이탈/탭 종료 시 sendBeacon 으로 마지막 갱신을 보장합니다.
 * - 통계 산정 시 세션당 최대 30분만 합산됩니다 (DB 쪽 LEAST(..., 30) 캡).
 *
 * 학생 역할에서만 동작 (관리자/강사 미리보기는 학습시간 통계에서 제외).
 */
const HEARTBEAT_INTERVAL_MS = 60_000; // 1분
const MAX_SESSION_MIN = 30;

export const useCourseLearningSession = (
  courseId: string | undefined,
  enabled: boolean,
) => {
  const { user, profile } = useUser();
  const sessionIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled || !courseId || !user?.id) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    // 세션 생성
    (async () => {
      const startedAt = new Date().toISOString();
      startedAtRef.current = Date.now();
      const { data, error } = await supabase
        .from("course_learning_sessions")
        .insert({
          user_id: user.id,
          course_id: courseId,
          tenant_id: profile?.tenant_id ?? null,
          started_at: startedAt,
          last_heartbeat_at: startedAt,
        })
        .select("id")
        .single();
      if (cancelled || error || !data) return;
      sessionIdRef.current = data.id;

      // heartbeat 시작
      intervalId = setInterval(() => {
        const elapsedMin = (Date.now() - startedAtRef.current) / 60_000;
        if (elapsedMin > MAX_SESSION_MIN + 1) return; // 30분 + 약간의 버퍼 후 중단
        const cappedTs = new Date(
          startedAtRef.current + Math.min(elapsedMin, MAX_SESSION_MIN) * 60_000,
        ).toISOString();
        void supabase
          .from("course_learning_sessions")
          .update({ last_heartbeat_at: cappedTs })
          .eq("id", sessionIdRef.current!);
      }, HEARTBEAT_INTERVAL_MS);
    })();

    // 탭 종료 / 페이지 이탈 시 마지막 heartbeat
    const flush = () => {
      if (!sessionIdRef.current) return;
      const elapsedMin = (Date.now() - startedAtRef.current) / 60_000;
      const cappedTs = new Date(
        startedAtRef.current + Math.min(elapsedMin, MAX_SESSION_MIN) * 60_000,
      ).toISOString();
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/course_learning_sessions?id=eq.${sessionIdRef.current}`;
        navigator.sendBeacon(
          url,
          new Blob(
            [JSON.stringify({ last_heartbeat_at: cappedTs })],
            { type: "application/json" },
          ),
        );
      } catch {
        // ignore
      }
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      flush();
      window.removeEventListener("beforeunload", flush);
    };
  }, [courseId, enabled, user?.id, profile?.tenant_id]);
};
