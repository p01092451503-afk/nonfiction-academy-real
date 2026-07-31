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
    let sessionGeneration = 0;

    const clearHeartbeat = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
    };

    // 현재 보이는 학습 구간의 마지막 시간을 저장한다.
    const flush = (sessionId = sessionIdRef.current, startedAt = startedAtRef.current) => {
      if (!sessionId || !startedAt) return;
      const elapsedMin = (Date.now() - startedAt) / 60_000;
      const cappedTs = new Date(
        startedAt + Math.min(elapsedMin, MAX_SESSION_MIN) * 60_000,
      ).toISOString();
      try {
        void supabase
          .from("course_learning_sessions")
          .update({ last_heartbeat_at: cappedTs })
          .eq("id", sessionId);

        supabase.auth.getSession().then(({ data }) => {
          const token = data.session?.access_token;
          if (!token) return;
          const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/course_learning_sessions?id=eq.${sessionId}`;
          fetch(url, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${token}`,
              Prefer: "return=minimal",
            },
            body: JSON.stringify({ last_heartbeat_at: cappedTs }),
            keepalive: true,
          }).catch(() => {});
        }).catch(() => {});
      } catch {
        // ignore
      }
    };

    const endVisibleSession = () => {
      sessionGeneration += 1;
      clearHeartbeat();
      flush();
      sessionIdRef.current = null;
      startedAtRef.current = 0;
    };

    // 화면이 실제로 보이는 동안에만 새 학습 세션을 생성한다.
    const startVisibleSession = async () => {
      if (cancelled || document.visibilityState !== "visible" || sessionIdRef.current) return;
      const generation = ++sessionGeneration;
      const startedAt = new Date().toISOString();
      const startedAtMs = Date.now();
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
      if (cancelled || generation !== sessionGeneration || document.visibilityState !== "visible" || error || !data) return;
      sessionIdRef.current = data.id;
      startedAtRef.current = startedAtMs;

      // heartbeat 시작
      const heartbeat = () => {
        if (document.visibilityState !== "visible") return;
        const elapsedMin = (Date.now() - startedAtRef.current) / 60_000;
        if (elapsedMin > MAX_SESSION_MIN + 1) {
          clearHeartbeat();
          return;
        }
        const cappedTs = new Date(
          startedAtRef.current + Math.min(elapsedMin, MAX_SESSION_MIN) * 60_000,
        ).toISOString();
        void supabase
          .from("course_learning_sessions")
          .update({ last_heartbeat_at: cappedTs })
          .eq("id", sessionIdRef.current);
      };
      heartbeat();
      intervalId = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
    };

    void startVisibleSession();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        endVisibleSession();
      } else {
        void startVisibleSession();
      }
    };
    const handleBeforeUnload = () => flush();
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      endVisibleSession();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [courseId, enabled, user?.id, profile?.tenant_id]);
};
