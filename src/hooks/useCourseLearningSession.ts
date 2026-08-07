import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";

/**
 * 강의 학습 세션 트래커
 * - 학습자가 강의 화면에 진입하면 세션을 1개 생성합니다 (started_at = now).
 * - 화면이 보이는 동안에만 15초 단위로 누적 학습시간을 기록합니다.
 * - 탭 전환/화면 잠금(hidden) 시에는 시간이 누적되지 않고 "일시정지"되며,
 *   다시 돌아오면 같은 세션을 재사용합니다 (세션 파편화 방지).
 * - last_heartbeat_at = started_at + 누적 시청시간(최대 30분) 으로 기록되므로
 *   자리비움 시간이 학습시간에 포함되지 않습니다.
 * - 페이지 이탈/탭 종료 시 keepalive fetch 로 마지막 갱신을 보장합니다.
 *
 * 학생 역할에서만 동작 (관리자/강사 미리보기는 학습시간 통계에서 제외).
 */
const HEARTBEAT_INTERVAL_MS = 15_000; // 15초
const MAX_SESSION_MIN = 30;
const MAX_SESSION_MS = MAX_SESSION_MIN * 60_000;

export const useCourseLearningSession = (
  courseId: string | undefined,
  enabled: boolean,
) => {
  const { user, profile } = useUser();
  const sessionIdRef = useRef<string | null>(null);
  const startedAtIsoRef = useRef<string | null>(null);
  const accumulatedMsRef = useRef<number>(0);
  const visibleSinceRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled || !courseId || !user?.id) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const clearHeartbeat = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
    };

    // 지금까지 누적된 "실제로 화면을 보고 있던" 시간(ms)
    const currentAccumulatedMs = () => {
      const live = visibleSinceRef.current ? Date.now() - visibleSinceRef.current : 0;
      return Math.min(accumulatedMsRef.current + live, MAX_SESSION_MS);
    };

    const buildTimestamp = () => {
      const base = startedAtIsoRef.current
        ? new Date(startedAtIsoRef.current).getTime()
        : Date.now();
      return new Date(base + currentAccumulatedMs()).toISOString();
    };

    // 일반 갱신 (15초마다)
    const persist = () => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      void supabase
        .from("course_learning_sessions")
        .update({ last_heartbeat_at: buildTimestamp() })
        .eq("id", sessionId);
    };

    // 이탈 직전 보장 저장 (keepalive)
    const flush = () => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      const ts = buildTimestamp();
      try {
        void supabase
          .from("course_learning_sessions")
          .update({ last_heartbeat_at: ts })
          .eq("id", sessionId);

        void supabase.auth
          .getSession()
          .then(({ data }) => {
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
              body: JSON.stringify({ last_heartbeat_at: ts }),
              keepalive: true,
            }).catch(() => {});
          })
          .catch(() => {});
      } catch {
        // ignore
      }
    };

    // 화면이 가려지면 누적을 멈추고(일시정지) 마지막 값을 저장한다. 세션은 유지.
    const pause = () => {
      if (visibleSinceRef.current) {
        accumulatedMsRef.current = Math.min(
          accumulatedMsRef.current + (Date.now() - visibleSinceRef.current),
          MAX_SESSION_MS,
        );
        visibleSinceRef.current = 0;
      }
      clearHeartbeat();
      flush();
    };

    const startHeartbeat = () => {
      clearHeartbeat();
      persist();
      intervalId = setInterval(() => {
        if (document.visibilityState !== "visible") return;
        if (accumulatedMsRef.current >= MAX_SESSION_MS) {
          clearHeartbeat();
          return;
        }
        persist();
      }, HEARTBEAT_INTERVAL_MS);
    };

    // 세션 시작 또는 재개 (같은 세션 재사용)
    const resume = async () => {
      if (cancelled || document.visibilityState !== "visible") return;

      if (sessionIdRef.current) {
        if (currentAccumulatedMs() >= MAX_SESSION_MS) return; // 30분 상한 도달
        if (!visibleSinceRef.current) visibleSinceRef.current = Date.now();
        startHeartbeat();
        return;
      }

      // 같은 강의의 최근 세션이 있으면 새로 만들지 않고 이어서 누적한다
      // (차시 이동/화면 전환 때마다 세션이 잘게 쪼개지는 문제 방지)
      const { data: recent } = await supabase
        .from("course_learning_sessions")
        .select("id, started_at, last_heartbeat_at")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .gte(
          "last_heartbeat_at",
          new Date(Date.now() - RESUME_WINDOW_MS).toISOString(),
        )
        .order("last_heartbeat_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (recent) {
        const prevMs =
          new Date(recent.last_heartbeat_at).getTime() -
          new Date(recent.started_at).getTime();
        if (prevMs < MAX_SESSION_MS) {
          sessionIdRef.current = recent.id;
          startedAtIsoRef.current = recent.started_at;
          accumulatedMsRef.current = Math.max(0, prevMs);
          visibleSinceRef.current = Date.now();
          if (document.visibilityState !== "visible") {
            pause();
            return;
          }
          startHeartbeat();
          return;
        }
      }

      const startedAt = new Date().toISOString();
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
      startedAtIsoRef.current = startedAt;
      accumulatedMsRef.current = 0;
      visibleSinceRef.current = Date.now();

      if (document.visibilityState !== "visible") {
        pause();
        return;
      }
      startHeartbeat();
    };

    void resume();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        pause();
      } else {
        void resume();
      }
    };
    const handleBeforeUnload = () => pause();
    const handlePageHide = () => pause();

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      pause();
      sessionIdRef.current = null;
      startedAtIsoRef.current = null;
      accumulatedMsRef.current = 0;
      visibleSinceRef.current = 0;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [courseId, enabled, user?.id, profile?.tenant_id]);
};
