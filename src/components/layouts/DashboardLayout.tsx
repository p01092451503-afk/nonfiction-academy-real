import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, BookOpen, ClipboardList, Trophy, Users, Settings, Compass, UserCircle, ClipboardCheck,
  LogOut, Menu, X, ChevronRight, ChevronDown, GraduationCap, CalendarCheck, Activity, Building2, Bell, Megaphone, FileText, BarChart3, Video,
  PanelLeftClose, PanelLeftOpen, Languages, Layers, Archive, Smartphone,
  Info, Globe2, Database, BookMarked,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useUser } from "@/contexts/UserContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { supabase } from "@/integrations/supabase/client";
import LanguageToggle from "@/components/LanguageToggle";
import RoleSwitcher from "@/components/RoleSwitcher";
import NotificationBell from "@/components/NotificationBell";
import GuidedTourButton from "@/components/GuidedTourButton";
import nonfictionLogo from "@/assets/nonfiction-logo.png";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ElementType;
  showNew?: boolean;
  tourId?: string;
  /** Items that cannot be hidden via system settings (e.g. dashboard, settings) */
  protected?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  role?: "student" | "teacher" | "admin";
  contentClassName?: string;
}

const DashboardLayout = ({ children, role = "student", contentClassName }: DashboardLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar-collapsed") === "true";
  });
  const [hasNewAnnouncement, setHasNewAnnouncement] = useState(false);
  const [hasNewBoardPost, setHasNewBoardPost] = useState(false);
  const [hasAssignedTracks, setHasAssignedTracks] = useState(false);
  const { profile, signOut } = useUser();
  const { primaryRole } = useUserRole();
  const { t, i18n } = useTranslation();
  const { teacherRoleEnabled, isMenuVisible } = useSystemSettings();

  const activeRole = role || primaryRole;

  // Redirect away from teacher dashboard if teacher role is disabled
  useEffect(() => {
    if (activeRole === "teacher" && !teacherRoleEnabled) {
      navigate("/student", { replace: true });
    }
  }, [activeRole, teacherRoleEnabled, navigate]);

  // Admin UI는 항상 한국어로 고정 — 다국어 토글도 admin에서는 노출되지 않음
  useEffect(() => {
    if (activeRole === "admin" && i18n.language !== "ko") {
      i18n.changeLanguage("ko");
    }
  }, [activeRole, i18n]);

  const toggleCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("sidebar-collapsed", String(next)); } catch { /* noop */ }
      return next;
    });
  };

  // Check for new announcements & board posts (published within last 24 hours)
  useEffect(() => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const checkNew = async () => {
      const { count } = await supabase
        .from("announcements")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true)
        .gte("created_at", since);
      setHasNewAnnouncement((count ?? 0) > 0);
    };
    const checkNewBoard = async () => {
      const { count } = await supabase
        .from("board_posts")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true)
        .gte("created_at", since);
      setHasNewBoardPost((count ?? 0) > 0);
    };
    checkNew();
    checkNewBoard();
  }, []);

  // Show "내 학습 트랙" only when the student has at least one assigned track
  useEffect(() => {
    if (activeRole !== "student" || !profile?.user_id) {
      setHasAssignedTracks(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("track_enrollments")
        .select("track_id", { count: "exact", head: true })
        .eq("user_id", profile.user_id);
      if (!cancelled) setHasAssignedTracks((count ?? 0) > 0);
    })();
    return () => { cancelled = true; };
  }, [activeRole, profile?.user_id]);

  // Preload user avatar for instant rendering
  useEffect(() => {
    if (profile?.avatar_url) {
      const img = new Image();
      img.src = profile.avatar_url;
    }
  }, [profile?.avatar_url]);

  const studentNav: NavItem[] = [
    { key: "dashboard", label: t("nav.dashboard"), href: "/student", icon: LayoutDashboard, tourId: "nav-dashboard", protected: true },
    { key: "catalog", label: t("nav.courseCatalog"), href: "/catalog", icon: Compass, tourId: "nav-catalog" },
    { key: "myCourses", label: t("nav.myCourses"), href: "/dashboard/courses", icon: BookOpen, tourId: "nav-courses" },
    ...(hasAssignedTracks ? [{ key: "myTracks", label: t("nav.myTracks", "내 학습 트랙"), href: "/student/tracks", icon: Layers } as NavItem] : []),
    { key: "assignments", label: t("nav.assignments"), href: "/dashboard/assignments", icon: ClipboardList, tourId: "nav-assignments" },
    { key: "achievements", label: t("nav.achievements"), href: "/dashboard/achievements", icon: Trophy, tourId: "nav-achievements" },
    { key: "announcements", label: t("nav.announcements", "공지사항"), href: "/student/announcements", icon: Megaphone, showNew: hasNewAnnouncement },
    { key: "board", label: t("nav.board", "게시판"), href: "/student/board", icon: FileText, showNew: hasNewBoardPost },
    { key: "userManual", label: t("nav.userManual", "사용자 매뉴얼"), href: "/manual", icon: BookMarked },
    { key: "myPage", label: t("nav.myPage"), href: "/mypage", icon: UserCircle, protected: true },
  ];

  const teacherNav: NavItem[] = [
    { key: "dashboard", label: t("nav.dashboard"), href: "/teacher", icon: LayoutDashboard, tourId: "nav-dashboard", protected: true },
    { key: "courseManagement", label: t("nav.courseManagement"), href: "/teacher/courses", icon: BookOpen, tourId: "nav-course-mgmt" },
    { key: "assignmentManagement", label: t("nav.assignmentManagement"), href: "/teacher/assignments", icon: ClipboardList, tourId: "nav-assignment-mgmt" },
    { key: "studentManagement", label: t("nav.studentManagement"), href: "/teacher/students", icon: Users, tourId: "nav-student-mgmt" },
    { key: "notificationManagement", label: t("nav.notificationManagement", "알림 관리"), href: "/teacher/notifications", icon: Bell },
    { key: "announcementManagement", label: t("nav.announcementManagement", "공지사항 관리"), href: "/teacher/announcements", icon: Megaphone },
    { key: "boardManagement", label: t("nav.boardManagement", "게시판 관리"), href: "/teacher/board", icon: FileText },
    { key: "attendanceManagement", label: t("nav.attendanceManagement"), href: "/teacher/attendance", icon: CalendarCheck },
    { key: "userManual", label: t("nav.userManual", "사용자 매뉴얼"), href: "/manual", icon: BookMarked },
  ];
  const adminGroups: NavGroup[] = [
    {
      label: "인사이트",
      items: [
        { key: "dashboard", label: t("nav.dashboard"), href: "/admin", icon: LayoutDashboard, tourId: "nav-dashboard", protected: true },
        { key: "trafficMonitoring", label: t("nav.trafficMonitoring", "통계 현황"), href: "/admin/traffic", icon: BarChart3, tourId: "nav-traffic" },
        { key: "globalDashboard", label: t("nav.globalDashboard", "글로벌 대시보드"), href: "/admin/global-dashboard", icon: Globe2 },
      ],
    },
    {
      label: "회원·조직",
      items: [
        { key: "userManagement", label: t("nav.userManagement"), href: "/admin/users", icon: Users, tourId: "nav-user-mgmt" },
        { key: "branchManagement", label: t("nav.branchManagement", "조직 관리"), href: "/admin/branches", icon: Building2, tourId: "nav-branch-mgmt" },
      ],
    },
    {
      label: "콘텐츠",
      items: [
        { key: "courseManagement", label: t("nav.courseManagement"), href: "/admin/courses", icon: BookOpen, tourId: "nav-course-mgmt" },
        { key: "trackManagement", label: t("nav.trackManagement", "학습 트랙 관리"), href: "/admin/tracks", icon: Layers },
        { key: "videoManagement", label: t("nav.videoManagement", "동영상 관리"), href: "/admin/videos", icon: Video },
        { key: "videoHealthCheck", label: t("nav.videoHealthCheck", "영상 자동 점검"), href: "/admin/video-health", icon: Activity },
        { key: "videoMobileCheck", label: t("nav.videoMobileCheck", "모바일 영상 점검"), href: "/admin/video-mobile-check", icon: Smartphone },
        { key: "i18nManagement", label: t("nav.i18nManagement", "다국어 관리"), href: "/admin/i18n", icon: Languages },
      ],
    },
    {
      label: "학습 운영",
      items: [
        { key: "enrollmentManagement", label: t("nav.enrollmentManagement"), href: "/admin/enrollments", icon: ClipboardCheck, tourId: "nav-enrollment-mgmt" },
        { key: "learningManagement", label: t("nav.learningManagement"), href: "/admin/learning", icon: GraduationCap },
        { key: "attendanceManagement", label: t("nav.attendanceManagement"), href: "/admin/attendance", icon: CalendarCheck },
        { key: "completionManagement", label: t("nav.completionManagement"), href: "/admin/completion", icon: Trophy, tourId: "nav-completion-mgmt" },
        { key: "surveyManagement", label: t("nav.surveyManagement", "설문 관리"), href: "/admin/surveys", icon: ClipboardList },
        { key: "migrationRecords", label: t("nav.migrationRecords", "이관 학습 이력"), href: "/admin/migration-records", icon: Database },
      ],
    },
    {
      label: "커뮤니케이션",
      items: [
        { key: "notificationManagement", label: t("nav.notificationManagement", "알림 관리"), href: "/admin/notifications", icon: Bell },
        { key: "announcementManagement", label: t("nav.announcementManagement", "공지사항 관리"), href: "/admin/announcements", icon: Megaphone },
        { key: "boardManagement", label: t("nav.boardManagement", "게시판 관리"), href: "/admin/board", icon: FileText },
      ],
    },
    {
      label: "시스템",
      items: [
        { key: "settings", label: t("nav.settings"), href: "/admin/settings", icon: Settings, tourId: "nav-settings", protected: true },
        { key: "platformUpdates", label: t("nav.platformUpdates", "플랫폼 업데이트 푸시"), href: "/admin/platform-updates", icon: Megaphone },
        { key: "pwaSettings", label: t("nav.pwaSettings", "PWA 앱 설정"), href: "/admin/pwa-settings", icon: Smartphone },
        { key: "systemInfo", label: t("nav.systemInfo", "시스템 정보"), href: "/admin/system-info", icon: Info },
      ],
    },
  ];

  // Apply visibility rules from system settings
  const filterItems = (items: NavItem[]) =>
    items.filter((it) => it.protected || isMenuVisible(activeRole as "student" | "teacher" | "admin", it.key));

  const flatNav = filterItems(activeRole === "teacher" ? teacherNav : studentNav);
  const navGroups: NavGroup[] | null = activeRole === "admin"
    ? adminGroups
        .map((g) => ({ ...g, items: filterItems(g.items) }))
        .filter((g) => g.items.length > 0)
    : null;
  // Track collapsed groups (admin only)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (label: string) =>
    setCollapsedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  const roleLabel = t(`roles.${activeRole}`);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const initials = profile?.full_name
    ? profile.full_name.slice(0, 2)
    : "NF";

  const renderNavLink = (item: NavItem) => {
    const isActive = location.pathname === item.href;
    return (
      <Link key={item.href} to={item.href} onClick={() => setSidebarOpen(false)}
        className={`nav-item ${isActive ? "nav-item-active" : ""} ${sidebarCollapsed ? "justify-center px-2" : ""}`}
        aria-current={isActive ? "page" : undefined}
        title={sidebarCollapsed ? item.label : undefined}
        {...(item.tourId ? { "data-tour": item.tourId } : {})}>
        <item.icon className="h-[18px] w-[18px]" aria-hidden="true" />
        {!sidebarCollapsed && <span>{item.label}</span>}
        {!sidebarCollapsed && item.showNew && (
          <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold leading-none rounded bg-destructive text-destructive-foreground animate-pulse">
            NEW
          </span>
        )}
        {!sidebarCollapsed && isActive && <ChevronRight className="h-3.5 w-3.5 ml-auto" aria-hidden="true" />}
        {sidebarCollapsed && item.showNew && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive animate-pulse" aria-hidden="true" />
        )}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen bg-background">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden" aria-hidden="true" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-[transform,width] duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} ${sidebarCollapsed ? "w-16" : "w-64"}`}
        role="navigation"
        aria-label={t("nav.mainNavigation", "메인 내비게이션")}
      >
        <div className={`${sidebarCollapsed ? "p-3 items-center" : "p-6 items-start"} flex flex-col relative transition-all`}>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label={t("common.closeSidebar", "사이드바 닫기")}>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          {sidebarCollapsed ? (
            <h1 className="font-display text-2xl tracking-wider text-sidebar-primary" aria-label="NONFICTION">N</h1>
          ) : (
            <>
              <img
                src={nonfictionLogo}
                alt="NONFICTION"
                className="h-[1.575rem] w-auto select-none"
                draggable={false}
              />
              <span className="mt-4 inline-block text-[11px] tracking-[0.1em] font-medium text-muted-foreground bg-accent px-2.5 py-0.5 rounded-full" aria-label={`${t("common.role", "역할")}: ${roleLabel}`}>
                {roleLabel}
              </span>
            </>
          )}
        </div>

        <nav className={`flex-1 overflow-y-auto py-4 ${sidebarCollapsed ? "px-2 space-y-1" : "px-3 space-y-4"}`} data-tour="sidebar-nav" aria-label={t("nav.sideNavigation", "사이드 메뉴")}>
          {navGroups ? (
            navGroups.map((group) => {
              const isGroupCollapsed = !!collapsedGroups[group.label];
              return (
                <div key={group.label} className={sidebarCollapsed ? "" : "space-y-1"}>
                  {!sidebarCollapsed && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.label)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 mb-0.5 rounded-full bg-foreground/10 text-[11px] font-semibold tracking-wide text-foreground/70 hover:bg-foreground/15 transition-colors"
                      aria-expanded={!isGroupCollapsed}
                    >
                      <span>{group.label}</span>
                      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isGroupCollapsed ? "" : "rotate-90"}`} aria-hidden="true" />
                    </button>
                  )}
                  {(sidebarCollapsed || !isGroupCollapsed) && (
                    <div className="space-y-0.5">
                      {group.items.map((item) => renderNavLink(item))}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="space-y-1">{flatNav.map((item) => renderNavLink(item))}</div>
          )}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <button onClick={handleSignOut} className={`nav-item w-full text-muted-foreground hover:text-destructive ${sidebarCollapsed ? "justify-center px-2" : ""}`} aria-label={t("auth.logout")} title={sidebarCollapsed ? t("auth.logout") : undefined}>
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
            {!sidebarCollapsed && <span>{t("auth.logout")}</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border h-16 flex items-center px-6 gap-4" role="banner">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground" aria-label={t("common.openSidebar", "메뉴 열기")}>
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            onClick={toggleCollapsed}
            className="hidden lg:inline-flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label={sidebarCollapsed ? t("common.expandSidebar", "사이드바 펼치기") : t("common.collapseSidebar", "사이드바 접기")}
            title={sidebarCollapsed ? t("common.expandSidebar", "사이드바 펼치기") : t("common.collapseSidebar", "사이드바 접기")}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" aria-hidden="true" /> : <PanelLeftClose className="h-5 w-5" aria-hidden="true" />}
          </button>
          <div className="flex-1" />
          {/* <GuidedTourButton role={activeRole as "student" | "teacher" | "admin"} /> */}
          {activeRole !== "admin" && (
            <div data-tour="language-toggle"><LanguageToggle /></div>
          )}
          <RoleSwitcher />
          <div data-tour="notification-bell"><NotificationBell /></div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 pl-3 border-l border-border outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md py-1 pr-2 hover:bg-accent/40 transition-colors"
                data-tour="user-profile"
                aria-label={t("common.userMenu", "사용자 메뉴")}
              >
                <div
                  className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-xs font-semibold text-accent-foreground overflow-hidden"
                  role="img"
                  aria-label={profile?.full_name || t("common.user")}
                >
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt={profile?.full_name || t("common.user")} className="h-full w-full object-cover" fetchPriority="high" decoding="async" />
                  ) : (
                    <span aria-hidden="true">{initials}</span>
                  )}
                </div>
                <span className="hidden sm:inline text-sm font-medium text-foreground leading-none">
                  {profile?.full_name || t("common.user")}
                </span>
                <ChevronDown className="hidden sm:inline h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-2">
                <p className="text-sm font-semibold text-foreground leading-tight">{profile?.full_name || t("common.user")}</p>
                <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                  {t(`roles.${primaryRole}`, primaryRole || "student")}
                </p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/mypage")} className="cursor-pointer gap-2">
                <UserCircle className="h-4 w-4" aria-hidden="true" />
                {t("nav.mypage", "마이페이지")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="cursor-pointer gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {t("common.logout", "로그아웃")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className={contentClassName || "flex-1 min-w-0 p-6 lg:p-8"} role="main">{children}</main>
      </div>
    </div>
  );
};

export default DashboardLayout;
