import { useMemo, useState } from "react";
import {
  BookOpen, Clock, ClipboardCheck, Award, Play, ArrowRight, TrendingUp, BarChart3, Star,
  AlertTriangle, Calendar, MessageSquare,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useUser } from "@/contexts/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { normalizeLang } from "@/lib/i18nLang";
import { localizeCourse } from "@/lib/i18nCourse";
import { computeCourseProgress } from "@/lib/courseCompletion";
import { MultiSelectPopover } from "@/components/ui/MultiSelectPopover";
import { Filter, RotateCcw } from "lucide-react";

const StudentDashboard = () => {
  const { user, profile } = useUser();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);
  const displayName = profile?.full_name || t("common.user");

  // ── 개인 통계 기간 필터 (년도/월) ──
  const CURRENT_YEAR = new Date().getFullYear();
  const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => ({ id: String(CURRENT_YEAR - i), label: String(CURRENT_YEAR - i) }));
  const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1), label: String(i + 1) }));
  const [periodYears, setPeriodYears] = useState<string[]>([]);
  const [periodMonths, setPeriodMonths] = useState<string[]>([]);

  // Build date ranges (UTC) for the selected years × months. Empty => no filter.
  const periodRanges = useMemo(() => {
    const years = periodYears.length ? periodYears.map(Number) : [];
    const months = periodMonths.length ? periodMonths.map(Number) : [];
    if (!years.length && !months.length) return null;
    const ys = years.length ? years : [CURRENT_YEAR];
    const ms = months.length ? months : Array.from({ length: 12 }, (_, i) => i + 1);
    const ranges: { start: string; end: string }[] = [];
    ys.forEach((y) => {
      ms.forEach((m) => {
        const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
        const end = new Date(Date.UTC(y, m, 1)).toISOString();
        ranges.push({ start, end });
      });
    });
    return ranges;
  }, [periodYears, periodMonths, CURRENT_YEAR]);
  const periodKey = periodRanges ? `${periodYears.join(",")}|${periodMonths.join(",")}` : "all";
  const inRange = (iso: string | null | undefined) => {
    if (!iso) return false;
    if (!periodRanges) return true;
    const t = new Date(iso).getTime();
    return periodRanges.some((r) => t >= new Date(r.start).getTime() && t < new Date(r.end).getTime());
  };


  // 수강 중인 강좌 (진행 중)
  const { data: enrollments = [] } = useQuery({
    queryKey: ["dash-enrollments", user?.id, lang],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("*, courses(id, title, instructor_id, difficulty_level, course_i18n(language_code, title), course_contents(language_code, title, is_published, order_index))")
        .eq("user_id", user!.id)
        .is("completed_at", null)
        .order("enrolled_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      if (lang === "ko") return data;
      return (data || []).map((e: any) => {
        if (!e.courses) return e;
        return { ...e, courses: localizeCourse(e.courses, lang) };
      });
    },
    enabled: !!user?.id,
  });

  // 강사 프로필 조회
  const instructorIds = [...new Set(enrollments.map((e: any) => e.courses?.instructor_id).filter(Boolean))];
  const { data: instructorProfiles = [] } = useQuery({
    queryKey: ["dash-instructors", instructorIds],
    queryFn: async () => {
      if (instructorIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", instructorIds);
      if (error) throw error;
      return data;
    },
    enabled: instructorIds.length > 0,
  });
  const instructorMap = new Map(instructorProfiles.map((p: any) => [p.user_id, p.full_name]));

  // 각 강좌의 다음 차시 조회
  const courseIds = enrollments.map((e: any) => e.course_id);
  const { data: courseContents = [] } = useQuery({
    queryKey: ["dash-course-contents", courseIds, lang],
    queryFn: async () => {
      if (courseIds.length === 0) return [];
      const { data, error } = await supabase
        .from("course_contents")
        .select("id, course_id, title, order_index, language_code")
        .in("course_id", courseIds)
        .order("order_index", { ascending: true });
      if (error) throw error;
      // course_contents 행 자체가 언어별로 분리되어 있음 → title 을 그대로 사용
      return data || [];
    },
    enabled: courseIds.length > 0,
  });

  const { data: contentProgress = [] } = useQuery({
    queryKey: ["dash-content-progress", user?.id, courseIds],
    queryFn: async () => {
      if (courseIds.length === 0) return [];
      const contentIds = courseContents.map((c: any) => c.id);
      if (contentIds.length === 0) return [];
      const { data, error } = await supabase
        .from("content_progress")
        .select("content_id, completed, progress_percentage")
        .eq("user_id", user!.id)
        .in("content_id", contentIds);
      if (error) throw error;
      return data;
    },
    enabled: courseContents.length > 0 && !!user?.id,
  });

  const completedContentIds = new Set(contentProgress.filter((p: any) => p.completed).map((p: any) => p.content_id));

  const getDisplayedCourseProgress = (enrollment: any) => {
    if (enrollment.completed_at) return 100;
    const contentsForCourse = courseContents.filter((c: any) => c.course_id === enrollment.course_id);
    const computed = computeCourseProgress(contentsForCourse, contentProgress as any, !!enrollment.completed_at);
    return Math.max(Math.round(Number(enrollment.progress) || 0), computed.percentage);
  };

  const getNextContent = (courseId: string) => {
    const all = courseContents.filter((c: any) => c.course_id === courseId);
    // 현재 UI 언어의 차시를 우선 사용, 없으면 한국어(원본)로 폴백
    const inLang = all.filter((c: any) => (c.language_code || "ko") === lang);
    const pool = inLang.length > 0 ? inLang : all.filter((c: any) => (c.language_code || "ko") === "ko");
    return pool.find((c: any) => !completedContentIds.has(c.id));
  };

  // 통계 (기간 필터 적용: completed_at 기준)
  const { data: enrollmentStats } = useQuery({
    queryKey: ["dash-enrollment-stats", user?.id, periodKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("progress, completed_at, completion_count")
        .eq("user_id", user!.id);
      if (error) throw error;
      const total = data.length;
      const filtered = periodRanges
        ? data.filter((e: any) => inRange(e.completed_at))
        : data;
      // 수강 완료 카운트: 복습 완료를 포함한 누적 횟수의 합. (기간 필터가 있으면 해당 기간에 완료된 강의만)
      const completed = filtered.reduce(
        (s, e: any) => s + (Number(e.completion_count) || (e.completed_at ? 1 : 0)),
        0,
      );
      const inProgress = Math.max(0, total - data.filter((e: any) => e.completed_at).length);
      const avgProgress = total > 0 ? Math.round(data.reduce((s, e: any) => s + (e.completed_at ? 100 : (Number(e.progress) || 0)), 0) / total) : 0;
      return { total, completed, inProgress, avgProgress };
    },
    enabled: !!user?.id,
  });

  // 완료한 과제 (기간 필터: submitted_at 범위)
  const { data: completedAssignments = 0 } = useQuery({
    queryKey: ["dash-completed-assignments", user?.id, periodKey],
    queryFn: async () => {
      let q = supabase
        .from("assignment_submissions")
        .select("submitted_at", { count: "exact" })
        .eq("student_id", user!.id)
        .eq("status", "graded");
      if (periodRanges && periodRanges.length) {
        const min = periodRanges.reduce((a, r) => (r.start < a ? r.start : a), periodRanges[0].start);
        const max = periodRanges.reduce((a, r) => (r.end > a ? r.end : a), periodRanges[0].end);
        q = q.gte("submitted_at", min).lt("submitted_at", max);
      }
      const { data, count, error } = await q;
      if (error) throw error;
      if (!periodRanges) return count || 0;
      return (data || []).filter((s: any) => inRange(s.submitted_at)).length;
    },
    enabled: !!user?.id,
  });

  const { data: totalAssignments = 0 } = useQuery({
    queryKey: ["dash-total-assignments", user?.id, periodKey],
    queryFn: async () => {
      let q = supabase
        .from("assignment_submissions")
        .select("submitted_at", { count: "exact" })
        .eq("student_id", user!.id);
      if (periodRanges && periodRanges.length) {
        const min = periodRanges.reduce((a, r) => (r.start < a ? r.start : a), periodRanges[0].start);
        const max = periodRanges.reduce((a, r) => (r.end > a ? r.end : a), periodRanges[0].end);
        q = q.gte("submitted_at", min).lt("submitted_at", max);
      }
      const { data, count, error } = await q;
      if (error) throw error;
      if (!periodRanges) return count || 0;
      return (data || []).filter((s: any) => inRange(s.submitted_at)).length;
    },
    enabled: !!user?.id,
  });

  // 뱃지 (누적 값이라 기간 필터 미적용)
  const { data: badgeCount = 0 } = useQuery({
    queryKey: ["dash-badge-count", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("user_badges")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id,
  });

  // 내가 작성한 강의 댓글 수 (기간 필터: created_at)
  const { data: myCommentCount = 0 } = useQuery({
    queryKey: ["dash-my-comment-count", user?.id, periodKey],
    queryFn: async () => {
      let q = supabase
        .from("course_comments")
        .select("created_at", { count: "exact" })
        .eq("user_id", user!.id)
        .eq("is_deleted", false);
      if (periodRanges && periodRanges.length) {
        const min = periodRanges.reduce((a, r) => (r.start < a ? r.start : a), periodRanges[0].start);
        const max = periodRanges.reduce((a, r) => (r.end > a ? r.end : a), periodRanges[0].end);
        q = q.gte("created_at", min).lt("created_at", max);
      }
      const { data, count, error } = await q;
      if (error) throw error;
      if (!periodRanges) return count || 0;
      return (data || []).filter((c: any) => inRange(c.created_at)).length;
    },
    enabled: !!user?.id,
  });

  // 게이미피케이션 (누적)
  const { data: gamification } = useQuery({
    queryKey: ["dash-gamification", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_gamification")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // 기간 내 획득 포인트 (point_history 기반)
  const { data: periodPoints = 0 } = useQuery({
    queryKey: ["dash-period-points", user?.id, periodKey],
    queryFn: async () => {
      let q = supabase.from("point_history").select("points, created_at").eq("user_id", user!.id);
      if (periodRanges && periodRanges.length) {
        const min = periodRanges.reduce((a, r) => (r.start < a ? r.start : a), periodRanges[0].start);
        const max = periodRanges.reduce((a, r) => (r.end > a ? r.end : a), periodRanges[0].end);
        q = q.gte("created_at", min).lt("created_at", max);
      }
      const { data, error } = await q;
      if (error) throw error;
      const rows = periodRanges ? (data || []).filter((r: any) => inRange(r.created_at)) : (data || []);
      return rows.reduce((s: number, r: any) => s + (Number(r.points) || 0), 0);
    },
    enabled: !!user?.id,
  });

  // 누적 학습시간 (분): course_learning_sessions, 세션당 30분 캡, 기간 필터 적용
  const { data: learningSessions = [] } = useQuery({
    queryKey: ["dash-learning-sessions", user?.id, periodKey],
    queryFn: async () => {
      let q = supabase
        .from("course_learning_sessions")
        .select("started_at, last_heartbeat_at")
        .eq("user_id", user!.id);
      if (periodRanges && periodRanges.length) {
        const min = periodRanges.reduce((a, r) => (r.start < a ? r.start : a), periodRanges[0].start);
        const max = periodRanges.reduce((a, r) => (r.end > a ? r.end : a), periodRanges[0].end);
        q = q.gte("started_at", min).lt("started_at", max);
      }
      const { data, error } = await q;
      if (error) throw error;
      return periodRanges ? (data || []).filter((s: any) => inRange(s.started_at)) : (data || []);
    },
    enabled: !!user?.id,
  });

  const learningMinutes = useMemo(() => {
    const SESSION_CAP_MIN = 30;
    let total = 0;
    (learningSessions as any[]).forEach((s) => {
      const start = new Date(s.started_at).getTime();
      const end = new Date(s.last_heartbeat_at).getTime();
      const min = Math.max(0, (end - start) / 60000);
      total += Math.min(min, SESSION_CAP_MIN);
    });
    return Math.round(total);
  }, [learningSessions]);

  // 학습일 (기간 필터 반영: 세션이 있는 서로 다른 날짜 수)
  const learningDays = useMemo(() => {
    const set = new Set<string>();
    (learningSessions as any[]).forEach((s) => {
      if (s.started_at) set.add(new Date(s.started_at).toISOString().slice(0, 10));
    });
    return set.size;
  }, [learningSessions]);



  // 필수교육 (마감 임박 우선)
  const { data: mandatoryCourses = [] } = useQuery({
    queryKey: ["dash-mandatory", user?.id, lang],
    queryFn: async () => {
      // Get enrolled mandatory courses that are not completed
      const { data: myEnrollments } = await supabase
        .from("enrollments")
        .select("id, course_id, progress")
        .eq("user_id", user!.id)
        .is("completed_at", null);

      if (!myEnrollments || myEnrollments.length === 0) return [];
      const enrolledMap = new Map(myEnrollments.map(e => [e.course_id, e]));
      const courseIds = [...enrolledMap.keys()];

      // 정책: 다국어 차시 중 하나라도 완료되면 강의 100% 완료.
      // enrollment.progress 가 stale 일 수 있으므로 content_progress 로 실측한다.
      const { data: contents } = await supabase
        .from("course_contents")
        .select("id, course_id")
        .in("course_id", courseIds);
      const contentIdToCourse = new Map((contents || []).map((c: any) => [c.id, c.course_id]));
      const allContentIds = (contents || []).map((c: any) => c.id);
      let completedCourses = new Set<string>();
      if (allContentIds.length > 0) {
        const { data: progress } = await supabase
          .from("content_progress")
          .select("content_id, completed")
          .eq("user_id", user!.id)
          .eq("completed", true)
          .in("content_id", allContentIds);
        (progress || []).forEach((p: any) => {
          const cid = contentIdToCourse.get(p.content_id);
          if (cid) completedCourses.add(cid);
        });
      }

      // 완료된 강의는 대시보드 필수교육 안내에서 제외 + enrollment 자동 동기화
      const stillPending = courseIds.filter(id => !completedCourses.has(id));
      const toSync = [...completedCourses].filter(id => {
        const e = enrolledMap.get(id) as any;
        return e && (Number(e.progress) !== 100);
      });
      if (toSync.length > 0) {
        await Promise.all(toSync.map(cid => {
          const e = enrolledMap.get(cid) as any;
          return supabase.from("enrollments")
            .update({ progress: 100, completed_at: new Date().toISOString() })
            .eq("id", e.id);
        }));
      }
      if (stillPending.length === 0) return [];

      const { data: courses, error } = await supabase
        .from("courses")
        .select("id, title, deadline, is_mandatory, course_i18n(language_code, title), course_contents(language_code, title, is_published, order_index)")
        .eq("is_mandatory", true)
        .eq("status", "published")
        .in("id", stillPending)
        .order("deadline", { ascending: true });

      if (error) throw error;
      return (courses || []).map(c => ({
        ...localizeCourse(c as any, lang),
        progress: 0,
        daysLeft: c.deadline ? Math.ceil((new Date(c.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null,
      }));
    },
    enabled: !!user?.id,
  });

  // 추천 강의 (수강하지 않은 published 강좌)
  const { data: recommendedCourses = [] } = useQuery({
    queryKey: ["dash-recommended", user?.id, lang],
    queryFn: async () => {
      const { data: enrolledData } = await supabase
        .from("enrollments")
        .select("course_id")
        .eq("user_id", user!.id);
      const enrolledIds = (enrolledData || []).map((e) => e.course_id);

      let query = supabase
        .from("courses")
        .select("id, title, instructor_id, course_i18n(language_code, title), course_contents(language_code, title, is_published, order_index)")
        .eq("status", "published")
        .limit(3);

      if (enrolledIds.length > 0) {
        // Filter out enrolled courses - use not.in
        const { data, error } = await supabase
          .from("courses")
          .select("id, title, instructor_id, course_i18n(language_code, title), course_contents(language_code, title, is_published, order_index)")
          .eq("status", "published")
          .not("id", "in", `(${enrolledIds.join(",")})`)
          .limit(3);
        if (error) throw error;
        return (data || []).map((c: any) => localizeCourse(c, lang));
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((c: any) => localizeCourse(c, lang));
    },
    enabled: !!user?.id,
  });


  // 추천 강좌 강사 정보
  const recInstructorIds = [...new Set(recommendedCourses.map((c: any) => c.instructor_id).filter(Boolean))];
  const { data: recInstructorProfiles = [] } = useQuery({
    queryKey: ["dash-rec-instructors", recInstructorIds],
    queryFn: async () => {
      if (recInstructorIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", recInstructorIds);
      if (error) throw error;
      return data;
    },
    enabled: recInstructorIds.length > 0,
  });
  const recInstructorMap = new Map(recInstructorProfiles.map((p: any) => [p.user_id, p.full_name]));

  // 추천 강좌 수강생 수
  const { data: recEnrollCounts = [] } = useQuery({
    queryKey: ["dash-rec-enroll-counts", recommendedCourses.map((c: any) => c.id)],
    queryFn: async () => {
      const ids = recommendedCourses.map((c: any) => c.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("enrollments")
        .select("course_id")
        .in("course_id", ids);
      if (error) throw error;
      return data || [];
    },
    enabled: recommendedCourses.length > 0,
  });
  const recEnrollCountMap = new Map<string, number>();
  recEnrollCounts.forEach((e: any) => {
    recEnrollCountMap.set(e.course_id, (recEnrollCountMap.get(e.course_id) || 0) + 1);
  });

  const assignmentCompletionRate = totalAssignments > 0 ? Math.round((completedAssignments / totalAssignments) * 100) : 0;

  const stats = [
    { label: t("dashboard.coursesInProgress"), value: String(enrollmentStats?.inProgress || 0), sub: t("dashboard.inProgress"), icon: BookOpen, href: "/dashboard/courses" },
    { label: t("dashboard.coursesCompleted"), value: String(enrollmentStats?.completed || 0), sub: t("dashboard.totalCourses", { count: enrollmentStats?.total || 0 }), icon: ClipboardCheck, href: "/dashboard/courses" },
    { label: t("dashboard.learningTime"), value: learningMinutes >= 60 ? `${Math.floor(learningMinutes / 60)}h ${learningMinutes % 60}m` : `${learningMinutes}m`, sub: t("dashboard.cumulativeLearning"), icon: Clock },
    { label: t("dashboard.badgesEarned"), value: String(badgeCount), sub: t("dashboard.earnedBadges"), icon: Award, href: "/dashboard/achievements" },
  ];

  const detailStats = [
    {
      label: t("dashboard.learningDays", { defaultValue: "누적 학습일" }),
      value: `${learningDays}${t("common.days")}`,
      sub: periodRanges
        ? t("dashboard.learningDaysPeriodSub", { defaultValue: "선택 기간 학습일" })
        : t("dashboard.learningDaysSub", { defaultValue: "학습한 총 일수" }),
      icon: TrendingUp,
    },
    { label: t("dashboard.level"), value: `Lv.${gamification?.level || 1}`, sub: `${gamification?.experience_points || 0} XP`, icon: Star },
    {
      label: t("dashboard.completionRate", { defaultValue: "이수율" }),
      value: `${enrollmentStats?.avgProgress || 0}%`,
      sub: t("dashboard.completionRateSub", { defaultValue: "전체 과정 개인 이수율" }),
      icon: ClipboardCheck,
    },
    {
      label: periodRanges ? t("dashboard.periodPoints", { defaultValue: "기간 획득 포인트" }) : t("dashboard.totalPoints"),
      value: String(periodRanges ? periodPoints : (gamification?.total_points || 0)),
      sub: periodRanges ? t("dashboard.periodPointsSub", { defaultValue: "선택 기간 합계" }) : t("dashboard.cumulativePoints"),
      icon: Award,
    },
    { label: t("dashboard.myComments", "내 댓글 수"), value: String(myCommentCount), sub: t("dashboard.myCommentsSub", "강의 작성 댓글"), icon: MessageSquare },
  ];


  return (
    <>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" aria-hidden="true" />
            {t("dashboard.learningDashboard")}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("dashboard.hello")}</p>
        </div>

        {/* 개인 통계 기간 필터 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground mr-1">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span>{t("dashboard.filter.period", { defaultValue: "기간" })}</span>
          </div>
          <MultiSelectPopover
            label={t("dashboard.filter.year", { defaultValue: "년도" })}
            placeholder={t("dashboard.filter.selectYear", { defaultValue: "년도 선택" })}
            options={YEAR_OPTIONS}
            selected={periodYears}
            onChange={setPeriodYears}
            width="w-[180px]"
          />
          <MultiSelectPopover
            label={t("dashboard.filter.month", { defaultValue: "월" })}
            placeholder={t("dashboard.filter.selectMonth", { defaultValue: "월 선택" })}
            options={MONTH_OPTIONS}
            selected={periodMonths}
            onChange={setPeriodMonths}
            width="w-[180px]"
          />
          {(periodYears.length > 0 || periodMonths.length > 0) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setPeriodYears([]); setPeriodMonths([]); }}
              className="h-9 text-xs text-muted-foreground hover:text-destructive gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              {t("dashboard.filter.clear", { defaultValue: "초기화" })}
            </Button>
          )}
        </div>


        {/* Stat Cards - Compact 2 rows */}
        <section className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3" aria-label={t("dashboard.stats", "학습 통계")}>
          {[...stats, ...detailStats].map((stat) => {
            const content = (
              <>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight truncate">{stat.label}</span>
                  <stat.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" aria-hidden="true" />
                </div>
                <p className="text-lg sm:text-xl font-bold text-foreground leading-tight">{stat.value}</p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 truncate">{stat.sub}</p>
              </>
            );
            const href = (stat as any).href;
            return href ? (
              <Link key={stat.label} to={href} className="stat-card !p-2.5 sm:!p-3 hover:shadow-md transition-shadow cursor-pointer" role="group" aria-label={stat.label}>
                {content}
              </Link>
            ) : (
              <div key={stat.label} className="stat-card !p-2.5 sm:!p-3" role="group" aria-label={stat.label}>
                {content}
              </div>
            );
          })}
        </section>

        {/* 필수교육 안내 */}
        {mandatoryCourses.length > 0 && (
          <section className="stat-card !p-6 space-y-4 border-destructive/30" aria-label={t("mandatory.title")} role="alert">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
              <div>
                <h2 className="text-lg font-bold text-foreground">{t("mandatory.title")}</h2>
                <p className="text-xs text-muted-foreground">{t("mandatory.subtitle")}</p>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden border border-border">
              {mandatoryCourses.map((mc: any, index: number) => {
                const isOverdue = mc.daysLeft !== null && mc.daysLeft < 0;
                const isToday = mc.daysLeft === 0;
                const isUrgent = mc.daysLeft !== null && mc.daysLeft <= 3;
                return (
                  <div key={mc.id} className={`!p-3 sm:!p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 border-b-2 border-border/80 last:border-b-0 ${isOverdue ? "bg-destructive/5" : isUrgent ? "bg-orange-50/50 dark:bg-orange-950/10" : ""}`} role="article" aria-label={mc.title}>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-foreground truncate">{mc.title}</h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          isOverdue ? "bg-destructive/10 text-destructive" :
                          isToday ? "bg-destructive/10 text-destructive" :
                          isUrgent ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" :
                          "bg-muted text-muted-foreground"
                        }`} role="status">
                          {isOverdue ? t("mandatory.overdue") :
                           isToday ? t("mandatory.today") :
                           mc.daysLeft !== null ? t("mandatory.daysLeft", { days: mc.daysLeft }) : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Progress value={mc.progress} className="h-2 flex-1" aria-label={`${t("dashboard.progressRate")}: ${Math.round(mc.progress)}%`} />
                        <span className="text-xs font-semibold text-foreground shrink-0">{Math.round(mc.progress)}%</span>
                      </div>
                      {mc.deadline && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Calendar className="h-3 w-3" aria-hidden="true" />
                          <time dateTime={mc.deadline}>{t("mandatory.deadline")}: {mc.deadline}</time>
                        </div>
                      )}
                    </div>
                    <Button size="sm" variant={isOverdue || isUrgent ? "destructive" : "outline"} className="shrink-0 rounded-full gap-1.5 w-full sm:w-auto" onClick={() => navigate(`/student/courses/${mc.id}?view=learn`)} aria-label={`${mc.title} - ${t("common.continue")}`}>
                      <Play className="h-3.5 w-3.5" aria-hidden="true" /> {t("common.continue")}
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="stat-card !p-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-foreground">{t("dashboard.ongoingCourses")}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{t("dashboard.continueStudy")}</p>
          </div>

          {enrollments.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">{t("dashboard.noCourses")}</p>
            </div>
          ) : (
            <div className="space-y-0 rounded-2xl overflow-hidden border border-border">
              {enrollments.map((enrollment: any, index: number) => {
                const nextContent = getNextContent(enrollment.course_id);
                const progress = getDisplayedCourseProgress(enrollment);
                const instructorName = instructorMap.get(enrollment.courses?.instructor_id) || t("dashboard.instructor");

                return (
                  <div key={enrollment.id} className="!p-4 sm:!p-5 space-y-3 border-b-2 border-border/80 last:border-b-0" role="article" aria-label={enrollment.courses?.title}>
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                      <div className="space-y-1 min-w-0 flex-1">
                        <h3 className="text-sm sm:text-base font-semibold text-foreground truncate">
                          {enrollment.courses?.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-muted-foreground">{instructorName}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 shrink-0 rounded-full w-full sm:w-auto"
                        onClick={() => {
                          if (nextContent) {
                            navigate(`/student/courses/${enrollment.course_id}/content/${nextContent.id}?view=learn`);
                          } else {
                            navigate(`/student/courses/${enrollment.course_id}?view=learn`);
                          }
                        }}
                        aria-label={`${enrollment.courses?.title} - ${t("common.continue")}`}
                      >
                        <Play className="h-3.5 w-3.5" aria-hidden="true" /> {t("common.continue")}
                      </Button>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t("dashboard.progressRate")}</span>
                        <span className="font-semibold text-foreground">{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2.5" aria-label={`${t("dashboard.progressRate")}: ${progress}%`} />
                    </div>

                    {nextContent && (
                      <p className="text-xs text-muted-foreground">
                        {t("dashboard.nextLesson", { title: nextContent.title })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 학습 통계 + 추천 강의 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* 학습 통계 */}
          <div className="stat-card !p-6 space-y-5">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="h-5 w-5" aria-hidden="true" /> {t("dashboard.learningStats")}
            </h2>
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("dashboard.weeklyGoal")}</span>
                  <span className="font-semibold text-foreground">
                    {gamification?.experience_points ? Math.round(gamification.experience_points / 60) : 0}h / 20h
                  </span>
                </div>
                <Progress
                  value={Math.min(100, ((gamification?.experience_points ? gamification.experience_points / 60 : 0) / 20) * 100)}
                  className="h-3"
                  aria-label={`${t("dashboard.weeklyGoal")}: ${gamification?.experience_points ? Math.round(gamification.experience_points / 60) : 0}h / 20h`}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("dashboard.assignmentCompletionRate")}</span>
                  <span className="font-semibold text-foreground">{assignmentCompletionRate}%</span>
                </div>
                <Progress value={assignmentCompletionRate} className="h-3" aria-label={`${t("dashboard.assignmentCompletionRate")}: ${assignmentCompletionRate}%`} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("dashboard.averageScore")}</span>
                  <span className="font-semibold text-foreground">{enrollmentStats?.avgProgress || 0}{t("common.points")}</span>
                </div>
                <Progress value={enrollmentStats?.avgProgress || 0} className="h-3" aria-label={`${t("dashboard.averageScore")}: ${enrollmentStats?.avgProgress || 0}${t("common.points")}`} />
              </div>
            </div>
          </div>

          {/* 추천 강의 */}
          <div className="stat-card !p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-foreground">{t("dashboard.recommendedCourses")}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{t("dashboard.recommendedDesc")}</p>
            </div>
            {recommendedCourses.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">{t("dashboard.noRecommended")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recommendedCourses.map((course: any) => (
                  <div key={course.id} className="stat-card !p-3 sm:!p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4" role="article" aria-label={course.title}>
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-sm font-semibold text-foreground truncate">{course.title}</h3>
                      <p className="text-xs text-muted-foreground">{recInstructorMap.get(course.instructor_id) || t("dashboard.instructor")}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" aria-hidden="true" />
                        <span>{(recEnrollCountMap.get(course.id) || 0).toLocaleString()} {t("dashboard.students")}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="shrink-0 rounded-full w-full sm:w-auto"
                      onClick={() => navigate(`/student/courses/${course.id}?view=learn`)}
                      aria-label={`${course.title} - ${t("common.details")}`}
                    >
                      {t("common.details")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default StudentDashboard;
