import { useRef, useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { syncEnrollmentOnContentCompleted } from "@/lib/courseCompletion";

interface UseVideoProgressOptions {
  userId: string | undefined;
  contentId: string | undefined;
  courseId: string | undefined;
  durationMinutes: number | undefined;
  existingProgress: any;
  enabled: boolean;
}

/**
 * Manages YouTube / Vimeo IFrame API progress tracking.
 * – Saves position every 10 s
 * – Auto-completes at 80 %
 * – Resumes from last saved position
 */
export function useVideoProgress({
  userId,
  contentId,
  courseId,
  durationMinutes,
  existingProgress,
  enabled,
}: UseVideoProgressOptions) {
  const queryClient = useQueryClient();
  const [playerReady, setPlayerReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [autoCompleted, setAutoCompleted] = useState(false);
  const ytPlayerRef = useRef<any>(null);
  const vimeoPlayerRef = useRef<any>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uiIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const hasResumedRef = useRef(false);
  const maxWatchedRef = useRef<number>(0);
  const seekGuardRef = useRef<boolean>(false);
  const SEEK_TOLERANCE = 2;


  const resumePosition = existingProgress?.last_position_seconds || 0;
  const isCompleted = existingProgress?.completed || false;

  // Initialize max-watched from saved progress; user may seek freely up to that.
  // Strictly: if item is already completed in DB, or saved progress crossed 80%,
  // disable the guard entirely by setting maxWatched to Infinity.
  useEffect(() => {
    const pct = Number(existingProgress?.progress_percentage) || 0;
    if (isCompleted || pct >= 80) {
      maxWatchedRef.current = Number.POSITIVE_INFINITY;
    } else {
      maxWatchedRef.current = resumePosition || 0;
    }
  }, [contentId, resumePosition, isCompleted, existingProgress?.progress_percentage]);

  const warnSeekBlocked = useCallback(() => {
    try {
      // Lightweight inline notice; avoid hard dep on toast here
      console.warn("[learning] forward seek blocked");
    } catch {}
  }, []);


  // ─── Upsert progress to DB ───
  const saveProgress = useCallback(
    async (posSeconds: number, pct: number, completed: boolean) => {
      if (!userId || !contentId) return;
      const payload = {
        user_id: userId,
        content_id: contentId,
        last_position_seconds: Math.round(posSeconds),
        progress_percentage: Math.round(pct),
        completed,
        completed_at: completed ? new Date().toISOString() : null,
        last_accessed_at: new Date().toISOString(),
      };

      if (existingProgress?.id) {
        await supabase
          .from("content_progress")
          .update(payload)
          .eq("id", existingProgress.id);
      } else {
        await supabase
          .from("content_progress")
          .upsert(payload, { onConflict: "user_id,content_id" });
      }

      if (completed) {
        // 한 차시 완료 시 강의 enrollment도 100% / completed 처리 (다국어 차시 정책)
        if (userId && courseId) {
          await syncEnrollmentOnContentCompleted({ userId, courseId });
        }
        queryClient.invalidateQueries({ queryKey: ["content-progress", courseId] });
        queryClient.invalidateQueries({ queryKey: ["enrollment", courseId] });
        queryClient.invalidateQueries({ queryKey: ["my-enrollments"] });
      }
    },
    [userId, contentId, courseId, existingProgress?.id, queryClient]
  );

  // ─── YouTube API ───
  const initYouTube = useCallback(
    (el: HTMLElement, videoId: string) => {
      // Load API script once
      if (!(window as any).YT) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }

      const create = () => {
        if (ytPlayerRef.current) {
          try { ytPlayerRef.current.destroy(); } catch {}
        }
        // Use existing iframe element directly
        ytPlayerRef.current = new (window as any).YT.Player(el, {
          events: {
            onReady: () => setPlayerReady(true),
            onStateChange: (e: any) => {
              if (e.data === (window as any).YT.PlayerState.PLAYING) {
                startPolling("youtube");
              } else {
                stopPolling();
              }
            },
          },
        });
      };

      if ((window as any).YT?.Player) {
        create();
      } else {
        (window as any).onYouTubeIframeAPIReady = create;
      }
    },
    [resumePosition, isCompleted]
  );

  // ─── Vimeo API ───
  const initVimeo = useCallback(
    async (iframeEl: HTMLIFrameElement) => {
      iframeRef.current = iframeEl;

      // Load Vimeo player script once
      if (!(window as any).Vimeo) {
        await new Promise<void>((resolve) => {
          const s = document.createElement("script");
          s.src = "https://player.vimeo.com/api/player.js";
          s.onload = () => resolve();
          document.head.appendChild(s);
        });
      }

      const player = new (window as any).Vimeo.Player(iframeEl);
      vimeoPlayerRef.current = player;

      player.ready().then(async () => {
        setPlayerReady(true);
        // 자동 재개하지 않음 — 사용자가 이어보기 다이얼로그에서 선택
      });

      player.on("play", () => startPolling("vimeo"));
      player.on("pause", () => stopPolling());
      player.on("ended", () => stopPolling());
    },
    []
  );

  // ─── Seek to specific position (allowed by app, e.g. resume) ───
  const seekTo = useCallback(async (seconds: number) => {
    seekGuardRef.current = true;
    if (seconds > maxWatchedRef.current) maxWatchedRef.current = seconds;
    if (ytPlayerRef.current?.seekTo) {
      try { ytPlayerRef.current.seekTo(seconds, true); } catch {}
    }
    if (vimeoPlayerRef.current?.setCurrentTime) {
      try { await vimeoPlayerRef.current.setCurrentTime(seconds); } catch {}
    }
    setTimeout(() => { seekGuardRef.current = false; }, 300);
  }, []);


  // ─── UI update loop (every 1s) ───
  const startUIPolling = useCallback(
    (type: "youtube" | "vimeo") => {
      if (uiIntervalRef.current) clearInterval(uiIntervalRef.current);
      uiIntervalRef.current = setInterval(async () => {
        let cur = 0;
        let dur = 0;
        if (type === "youtube" && ytPlayerRef.current) {
          cur = ytPlayerRef.current.getCurrentTime?.() || 0;
          dur = ytPlayerRef.current.getDuration?.() || 0;
        } else if (type === "vimeo" && vimeoPlayerRef.current) {
          cur = (await vimeoPlayerRef.current.getCurrentTime()) || 0;
          dur = (await vimeoPlayerRef.current.getDuration()) || 0;
        }

        // First-watch forward-seek guard: snap back if user scrubbed past max-watched.
        if (!isCompleted && !autoCompleted && !seekGuardRef.current && cur > maxWatchedRef.current + SEEK_TOLERANCE) {
          const target = Math.max(0, maxWatchedRef.current);
          seekGuardRef.current = true;
          try {
            if (type === "youtube" && ytPlayerRef.current?.seekTo) {
              ytPlayerRef.current.seekTo(target, true);
            } else if (type === "vimeo" && vimeoPlayerRef.current?.setCurrentTime) {
              await vimeoPlayerRef.current.setCurrentTime(target);
            }
          } catch {}
          warnSeekBlocked();
          setTimeout(() => { seekGuardRef.current = false; }, 400);
          cur = target;
        }

        if (cur > maxWatchedRef.current) maxWatchedRef.current = cur;
        setCurrentTime(cur);
        setDuration(dur);

        // Auto-complete check
        if (dur > 0) {
          const pct = (cur / dur) * 100;
          if (pct >= 80 && !isCompleted && !autoCompleted) {
            setAutoCompleted(true);
            await saveProgress(cur, pct, true);
          }
        }
      }, 1000);
    },
    [isCompleted, autoCompleted, saveProgress, warnSeekBlocked]
  );

  // ─── DB save loop (every 10s) ───
  const startPolling = useCallback(
    (type: "youtube" | "vimeo") => {
      stopPolling();
      startUIPolling(type);
      saveIntervalRef.current = setInterval(async () => {
        let cur = 0;
        let dur = 0;

        if (type === "youtube" && ytPlayerRef.current) {
          cur = ytPlayerRef.current.getCurrentTime?.() || 0;
          dur = ytPlayerRef.current.getDuration?.() || 0;
        } else if (type === "vimeo" && vimeoPlayerRef.current) {
          cur = (await vimeoPlayerRef.current.getCurrentTime()) || 0;
          dur = (await vimeoPlayerRef.current.getDuration()) || 0;
        }

        if (dur <= 0) return;
        const pct = (cur / dur) * 100;
        await saveProgress(cur, pct, isCompleted || autoCompleted);
      }, 10000);
    },
    [isCompleted, autoCompleted, saveProgress, startUIPolling]
  );

  const stopPolling = useCallback(() => {
    if (saveIntervalRef.current) {
      clearInterval(saveIntervalRef.current);
      saveIntervalRef.current = null;
    }
    if (uiIntervalRef.current) {
      clearInterval(uiIntervalRef.current);
      uiIntervalRef.current = null;
    }
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      stopPolling();
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch {}
        ytPlayerRef.current = null;
      }
      vimeoPlayerRef.current = null;
    };
  }, [contentId]);

  return {
    initYouTube,
    initVimeo,
    playerReady,
    currentTime,
    duration,
    autoCompleted,
    resumePosition,
    seekTo,
  };
}
