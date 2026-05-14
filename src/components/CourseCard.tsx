import { Link } from "react-router-dom";
import { Clock, Users, BookOpen, Star, Sparkles, AlertTriangle, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "react-i18next";
import CourseThumbnail from "@/components/CourseThumbnail";

const categoryGradients: Record<string, string> = {
  marketing: "from-orange-500 to-pink-500", sales: "from-blue-500 to-cyan-500",
  "product-development": "from-purple-500 to-indigo-500", "skin-science": "from-rose-400 to-pink-600",
  "beauty-trends": "from-fuchsia-500 to-violet-500", "design-creative": "from-amber-400 to-orange-500",
  "quality-regulation": "from-emerald-500 to-teal-500", "scm-logistics": "from-sky-500 to-blue-600",
  "management-leadership": "from-slate-500 to-zinc-600", "finance-accounting": "from-green-500 to-emerald-600",
  "hr-culture": "from-pink-400 to-rose-500", "it-digital": "from-violet-500 to-purple-600",
  "customer-service": "from-cyan-400 to-blue-500", "legal-compliance": "from-gray-500 to-slate-600",
  "self-development": "from-yellow-400 to-amber-500", "safety-environment": "from-lime-500 to-green-600",
};

interface CourseCardProps {
  course: { id: string; title: string; description?: string | null; status?: string | null; difficulty_level?: string | null; estimated_duration_hours?: number | null; is_mandatory?: boolean | null; thumbnail_url?: string | null; category_id?: string | null; deadline?: string | null; };
  categorySlug?: string | null; categoryName?: string | null; studentCount?: number; contentCount?: number; instructorName?: string | null; progress?: number | null; isCompleted?: boolean; variant?: "student" | "teacher" | "admin"; href?: string;
}

const CourseCard = ({ course, categorySlug, categoryName, studentCount, contentCount, instructorName, progress, isCompleted, variant = "student", href }: CourseCardProps) => {
  const { t } = useTranslation();
  const gradient = categoryGradients[categorySlug || ""] || "from-primary to-primary/80";
  const isPublished = course.status === "published";
  const isDraft = course.status === "draft";
  const linkTo = href || `/courses/${course.id}`;

  const difficultyLabel: Record<string, string> = {
    beginner: t("teacher.beginner"), intermediate: t("teacher.intermediate"), advanced: t("teacher.advanced"),
  };

  return (
    <Link to={linkTo} className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl" aria-label={course.title}>
      <div className="stat-card !p-0 overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5">
        <div className={`relative bg-gradient-to-br ${gradient} overflow-hidden`}>
          <CourseThumbnail
            src={course.thumbnail_url}
            alt={course.title}
            className="w-full rounded-none"
            fallbackClassName="flex aspect-[16/10] w-full items-center justify-center rounded-none bg-transparent"
            iconClassName="h-12 w-12 text-primary-foreground/30"
          />
          <div className="absolute top-3 left-3 flex items-center gap-1.5 flex-wrap">
            {isDraft && <span className="text-[10px] font-semibold bg-background/90 text-foreground px-2.5 py-1 rounded-lg backdrop-blur-sm">{t("teacher.draft")}</span>}
            {!isDraft && !isPublished && <span className="text-[10px] font-semibold bg-amber-500 text-white px-2.5 py-1 rounded-lg">{t("teacher.openingSoon")}</span>}
            {course.is_mandatory && <span className="text-[10px] font-semibold bg-destructive text-destructive-foreground px-2.5 py-1 rounded-lg">{t("common.required")}</span>}
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
            {categoryName && <span className="inline-flex items-center gap-1 text-[10px] font-medium text-white/90 bg-white/20 px-2 py-0.5 rounded-md backdrop-blur-sm mb-1.5"><Sparkles className="h-2.5 w-2.5" /> {categoryName}</span>}
            <h3 className="text-sm font-bold text-white leading-snug line-clamp-2">{course.title}</h3>
          </div>
          {course.difficulty_level && (
            <div className="absolute top-3 right-3">
              <span className="text-[10px] font-bold bg-white/90 text-foreground px-2 py-1 rounded-lg backdrop-blur-sm">{difficultyLabel[course.difficulty_level] || course.difficulty_level}</span>
            </div>
          )}
        </div>
        <div className="p-3.5 space-y-2.5">
          {course.description && <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{course.description}</p>}
          <div className="flex items-center gap-3 flex-wrap">
            
            {studentCount != null && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" aria-hidden="true" /> {studentCount}{t("common.people")}</span>}
            {contentCount != null && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><BookOpen className="h-3 w-3" aria-hidden="true" /> {t("course.lessonsCount", { count: contentCount })}</span>}
            {instructorName && <span className="text-[10px] text-muted-foreground">{instructorName}</span>}
          </div>
          {progress != null && !isCompleted && (
            <div className="flex items-center gap-2.5"><Progress value={progress} className="flex-1 h-1.5" aria-label={`${t("dashboard.progressRate", "진행률")}: ${Math.round(progress)}%`} /><span className="text-[10px] font-medium text-muted-foreground">{Math.round(progress)}%</span></div>
          )}
          {isCompleted && (
            <div className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" aria-hidden="true" /><span className="text-xs font-medium text-green-600 dark:text-green-400">{t("course.completionLabel")}</span></div>
          )}
          {(variant === "teacher" || variant === "admin") && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant={isPublished ? "default" : "secondary"} className="text-[10px] h-5">{isPublished ? t("teacher.published") : t("teacher.draft")}</Badge>
              {course.is_mandatory && <Badge variant="destructive" className="text-[10px] h-5 gap-0.5"><AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />{t("common.required")}</Badge>}
              {course.deadline && (() => {
                const daysLeft = Math.ceil((new Date(course.deadline).getTime() - Date.now()) / 86400000);
                return (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <CalendarClock className="h-3 w-3" aria-hidden="true" />
                    {daysLeft > 0 ? `D-${daysLeft}` : daysLeft === 0 ? "D-Day" : t("student.overdue")}
                  </span>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

export default CourseCard;