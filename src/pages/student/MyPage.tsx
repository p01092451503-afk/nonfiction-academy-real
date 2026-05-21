import { useState, useMemo } from "react";
import { User, Lock, Camera, ArrowRight, UserCircle, BookOpen, Trophy, Star, TrendingUp, Award, Download, Archive, Eye, EyeOff, Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import AvatarTab from "@/components/mypage/AvatarTab";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { generateCertificateImage, downloadBlob } from "@/lib/certificateGenerator";

const MyPage = () => {
  const { user, profile, refreshProfile } = useUser();
  const { toast } = useToast();
  const { t } = useTranslation();
  

  // Profile fields
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [phone, setPhone] = useState(profile?.phone_number || "");
  const [position, setPosition] = useState(profile?.position || "");
  const [teamName, setTeamName] = useState(profile?.team_name || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);




  // Password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPw, setIsChangingPw] = useState(false);

  const pwChecks = useMemo(() => ({
    length: newPassword.length >= 8,
    letter: /[A-Za-z]/.test(newPassword),
    number: /\d/.test(newPassword),
    special: /[^A-Za-z0-9]/.test(newPassword),
  }), [newPassword]);
  const pwAllValid = pwChecks.length && pwChecks.letter && pwChecks.number && pwChecks.special;

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          phone_number: phone,
          position,
          team_name: teamName,
        })
        .eq("user_id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast({ title: t("mypage.profileSaved") });
    } catch (e: any) {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    } finally {
      setIsSavingProfile(false);
    }
  };




  const handleChangePassword = async () => {
    if (!pwAllValid) {
      toast({ title: t("common.error"), description: t("mypage.passwordRequirementsNotMet", "비밀번호 요구사항을 모두 충족해야 합니다."), variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: t("common.error"), description: t("mypage.passwordMismatch"), variant: "destructive" });
      return;
    }
    setIsChangingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: t("mypage.passwordChanged") });
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      const raw = (e?.message || "").toLowerCase();
      let desc = e?.message;
      if (raw.includes("weak") || raw.includes("pwned") || raw.includes("known to be")) {
        desc = t("mypage.passwordWeak", "이 비밀번호는 유출된 적이 있거나 너무 단순합니다. 다른 비밀번호를 사용해 주세요.");
      } else if (raw.includes("should be at least") || raw.includes("at least")) {
        desc = t("mypage.passwordTooShort", "비밀번호가 너무 짧습니다.");
      }
      toast({ title: t("common.error"), description: desc, variant: "destructive" });
    } finally {
      setIsChangingPw(false);
    }
  };

  // Certificates
  const { data: certificates = [] } = useQuery({
    queryKey: ["my-certificates", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificates")
        .select("*, courses(title)")
        .eq("user_id", user!.id)
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: certTemplates = [] } = useQuery({
    queryKey: ["cert-templates-for-my-certs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("certificate_templates").select("*");
      if (error) throw error;
      return data;
    },
    enabled: certificates.length > 0,
  });

  const { data: legacyRecords = [] } = useQuery({
    queryKey: ["my-legacy-records", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legacy_learning_records")
        .select("*")
        .eq("user_id", user!.id)
        .order("completed_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Migration records (이관 학습 이력) matched by email
  const { data: migrationRecords = [] } = useQuery({
    queryKey: ["my-migration-records", user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const { data: emp, error: empErr } = await supabase
        .from("migration_employees")
        .select("employee_id,email,country")
        .ilike("email", user.email);
      if (empErr) throw empErr;
      if (!emp || emp.length === 0) return [];

      const empIds = emp.map((e: any) => e.employee_id);
      const [{ data: comps, error: cmpErr }, { data: courses, error: cErr }] = await Promise.all([
        supabase.from("migration_completions").select("employee_id,course_id,status").in("employee_id", empIds),
        supabase.from("migration_courses").select("course_id,course_name,year,country"),
      ]);
      if (cmpErr) throw cmpErr;
      if (cErr) throw cErr;
      const courseMap = new Map((courses || []).map((c: any) => [c.course_id, c]));
      return (comps || [])
        .filter((c: any) => c.status !== "not_assigned")
        .map((c: any) => {
          const course: any = courseMap.get(c.course_id);
          return {
            id: `mig-${c.employee_id}-${c.course_id}`,
            course_title: course?.course_name || "-",
            source_lms: `Legacy LMS (${course?.country || ""}${course?.year ? ` · ${course.year}` : ""})`.trim(),
            completed_at: null as string | null,
            is_completed: c.status === "completed",
            status: c.status as string,
          };
        });
    },
    enabled: !!user?.email,
  });

  const combinedLegacyRecords = useMemo(() => {
    return [...migrationRecords, ...legacyRecords];
  }, [migrationRecords, legacyRecords]);


  const [downloadingCertId, setDownloadingCertId] = useState<string | null>(null);

  const handleDownloadCert = async (cert: any) => {
    setDownloadingCertId(cert.id);
    try {
      const course = cert.courses;
      const template = certTemplates.find((t: any) => t.course_id === cert.course_id);
      const blob = await generateCertificateImage({
        studentName: profile?.full_name || "-",
        studentEmail: user?.email || "-",
        courseName: course?.title || "-",
        issuedDate: new Date(cert.issued_at).toLocaleDateString("ko-KR"),
        certificateNumber: cert.certificate_number,
        titleText: template?.title_text || "수료증",
        descText: template?.description_text || "위 사람은 본 교육과정을 성실히 이수하였기에 이 증서를 수여합니다.",
        issuerName: template?.issuer_name || "",
        backgroundImageUrl: template?.background_image_url || null,
      });
      downloadBlob(blob, `certificate_${cert.certificate_number}.png`);
    } catch (e: any) {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    } finally {
      setDownloadingCertId(null);
    }
  };


  const { data: enrollmentStats } = useQuery({
    queryKey: ["mypage-enrollment-stats", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("status, completed_at")
        .eq("user_id", user!.id)
        .eq("status", "approved");
      if (error) throw error;
      const inProgress = data.filter((e: any) => !e.completed_at).length;
      const completed = data.filter((e: any) => e.completed_at).length;
      return { inProgress, completed, total: data.length };
    },
    enabled: !!user?.id,
  });

  const { data: gamification } = useQuery({
    queryKey: ["mypage-gamification", user?.id],
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

  const { data: badgeCount = 0 } = useQuery({
    queryKey: ["mypage-badges", user?.id],
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

  const streakDays = gamification?.streak_days || 0;
  const totalPoints = gamification?.total_points || 0;
  const level = gamification?.level || 1;
  const xp = gamification?.experience_points || 0;
  const xpToNext = (level) * 100;
  const xpProgress = Math.min(100, (xp / xpToNext) * 100);

  return (
    <DashboardLayout role="student">
      <div className="space-y-6">
        {/* Page Title */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <UserCircle className="h-6 w-6" aria-hidden="true" />{t("nav.myPage")}
          </h1>
        </div>

        {/* Profile Header */}
        <div className="border border-border rounded-xl p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10">
            {/* Left: avatar + info */}
            <div className="flex items-center gap-5 lg:min-w-[320px]">
              <Avatar className="h-20 w-20 border-2 border-border shadow-sm">
                <AvatarImage src={profile?.avatar_url || ""} alt={profile?.full_name || ""} />
                <AvatarFallback className="bg-card text-foreground text-xl font-semibold">
                  {profile?.full_name?.charAt(0) || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 space-y-1">
                <h2 className="text-xl font-bold text-foreground">{profile?.full_name || t("common.user")}</h2>
                <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {profile?.department && (
                    <span className="text-[11px] bg-secondary text-muted-foreground px-2 py-0.5 rounded-md">{profile.department}</span>
                  )}
                  {profile?.position && (
                    <span className="text-[11px] bg-secondary text-muted-foreground px-2 py-0.5 rounded-md">{profile.position}</span>
                  )}
                  {profile?.team_name && (
                    <span className="text-[11px] bg-secondary text-muted-foreground px-2 py-0.5 rounded-md">{profile.team_name}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: mini dashboard */}
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="border border-border rounded-xl p-3 sm:p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{t("dashboard.inProgress")}</span>
                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="text-2xl font-bold text-foreground leading-none">{enrollmentStats?.inProgress || 0}</p>
                <p className="text-[10px] text-muted-foreground">{t("dashboard.totalCourses", { count: enrollmentStats?.total || 0 })}</p>
              </div>

              <div className="border border-border rounded-xl p-3 sm:p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{t("dashboard.coursesCompleted")}</span>
                  <Trophy className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="text-2xl font-bold text-foreground leading-none">{enrollmentStats?.completed || 0}</p>
                <div className="h-1 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${enrollmentStats?.total ? ((enrollmentStats.completed || 0) / enrollmentStats.total) * 100 : 0}%` }} />
                </div>
              </div>

              <div className="border border-border rounded-xl p-3 sm:p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{t("dashboard.level")}</span>
                  <Star className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="text-2xl font-bold text-foreground leading-none">Lv.{level}</p>
                <div className="flex items-center gap-1.5">
                  <div className="h-1 flex-1 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${xpProgress}%` }} />
                  </div>
                  <span className="text-[9px] text-muted-foreground shrink-0">{xp}/{xpToNext} XP</span>
                </div>
              </div>

              <div className="border border-border rounded-xl p-3 sm:p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{t("dashboard.earnedBadges")}</span>
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="text-2xl font-bold text-foreground leading-none">{badgeCount}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>🔥 {streakDays}{t("common.days")}</span>
                  <span className="text-foreground/20">·</span>
                  <span>{totalPoints} P</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="bg-secondary/50 rounded-xl p-1">
            <TabsTrigger value="profile" className="rounded-lg gap-1.5 text-sm">
              <User className="h-4 w-4" /> {t("mypage.profileTab")}
            </TabsTrigger>
            <TabsTrigger value="avatar" className="rounded-lg gap-1.5 text-sm">
              <Camera className="h-4 w-4" /> {t("mypage.avatarTab")}
            </TabsTrigger>
            <TabsTrigger value="certificates" className="rounded-lg gap-1.5 text-sm">
              <Award className="h-4 w-4" /> {t("mypage.certificatesTab")}
            </TabsTrigger>
            <TabsTrigger value="legacy" className="rounded-lg gap-1.5 text-sm">
              <Archive className="h-4 w-4" /> {t("mypage.legacyTab", "학습 이력 관리")}
            </TabsTrigger>
            <TabsTrigger value="password" className="rounded-lg gap-1.5 text-sm">
              <Lock className="h-4 w-4" /> {t("mypage.passwordTab")}
            </TabsTrigger>
          </TabsList>

            {/* Profile Tab */}
            <TabsContent value="profile">
              <div className="max-w-lg space-y-6">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">{t("mypage.profileInfo")}</h2>
                  <p className="text-sm text-muted-foreground">{t("mypage.profileInfoDesc")}</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("mypage.email")}</label>
                    <Input value={user?.email || ""} disabled className="h-11 rounded-xl bg-secondary/30 border-border" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("mypage.name")}</label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11 rounded-xl border-border" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("mypage.phone")}</label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" className="h-11 rounded-xl border-border" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("mypage.position")}</label>
                      <Input value={position} onChange={(e) => setPosition(e.target.value)} className="h-11 rounded-xl border-border" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("mypage.team")}</label>
                      <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} className="h-11 rounded-xl border-border" />
                    </div>
                  </div>
                </div>
                <Button onClick={handleSaveProfile} disabled={isSavingProfile} className="rounded-xl gap-1.5">
                  {isSavingProfile ? t("common.saving") : t("common.save")}
                </Button>
              </div>
            </TabsContent>

            {/* Avatar Tab */}
            <TabsContent value="avatar">
              <AvatarTab />
            </TabsContent>

            {/* Certificates Tab */}
            <TabsContent value="certificates">
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">{t("mypage.certificateManagement")}</h2>
                  <p className="text-sm text-muted-foreground">{t("mypage.certificateManagementDesc")}</p>
                </div>
                {certificates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 space-y-3">
                    <div className="h-14 w-14 rounded-full bg-accent flex items-center justify-center">
                      <Award className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">{t("mypage.noCertificates")}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {certificates.map((cert: any) => (
                      <div key={cert.id} className="flex items-center justify-between gap-4 border border-border rounded-xl p-4">
                        <div className="min-w-0 space-y-1">
                          <h3 className="text-sm font-semibold text-foreground truncate">{(cert.courses as any)?.title || "-"}</h3>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>No. {cert.certificate_number}</span>
                            <span>·</span>
                            <span>{new Date(cert.issued_at).toLocaleDateString("ko-KR")}</span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg gap-1.5 shrink-0"
                          onClick={() => handleDownloadCert(cert)}
                          disabled={downloadingCertId === cert.id}
                        >
                          <Download className="h-3.5 w-3.5" />
                          {downloadingCertId === cert.id ? t("mypage.generating") : t("mypage.downloadCert")}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="legacy">
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">{t("mypage.legacyTitle")}</h2>
                  <p className="text-sm text-muted-foreground">{t("mypage.legacyDesc")}</p>
                </div>
                {combinedLegacyRecords.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 space-y-3">
                    <div className="h-14 w-14 rounded-full bg-accent flex items-center justify-center">
                      <Archive className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">{t("mypage.legacyEmpty")}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {combinedLegacyRecords.map((r: any) => {
                      const statusLabel =
                        r.status === "in_progress" ? "진행중"
                        : r.status === "on_leave" ? "휴직"
                        : r.is_completed ? t("mypage.legacyCompleted")
                        : t("mypage.legacyNotCompleted");
                      const statusCls =
                        r.is_completed
                          ? "bg-foreground text-background"
                          : r.status === "in_progress"
                            ? "bg-amber-500/10 text-amber-700 border border-amber-500/30"
                            : r.status === "on_leave"
                              ? "bg-violet-500/10 text-violet-700 border border-violet-500/30"
                              : "border border-border text-muted-foreground";
                      return (
                        <div key={r.id} className="flex items-center justify-between gap-4 border-b-2 border-border/80 pb-3">
                          <div className="min-w-0 space-y-1">
                            <h3 className="text-sm font-semibold text-foreground truncate">{r.course_title}</h3>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                              {r.source_lms && <span>{r.source_lms}</span>}
                              {r.completed_at && <><span>·</span><span>{r.completed_at}</span></>}
                            </div>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-1 rounded shrink-0 ${statusCls}`}>{statusLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="password">
              <div className="max-w-lg space-y-6">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">{t("mypage.changePassword")}</h2>
                  <p className="text-sm text-muted-foreground">{t("mypage.changePasswordDesc")}</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("mypage.newPassword")}</label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={t("mypage.newPasswordPlaceholder")}
                        className="h-11 rounded-xl border-border pr-11"
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={showPassword ? t("auth.hidePassword", "비밀번호 숨기기") : t("auth.showPassword", "비밀번호 보이기")}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {/* Password requirements */}
                    <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1.5">
                      <p className="text-xs font-medium text-foreground mb-1.5">{t("mypage.passwordRequirements", "비밀번호 요구사항")}</p>
                      {[
                        { ok: pwChecks.length, label: t("mypage.pwReqLength", "최소 8자 이상") },
                        { ok: pwChecks.letter, label: t("mypage.pwReqLetter", "영문자 포함 (a-z, A-Z)") },
                        { ok: pwChecks.number, label: t("mypage.pwReqNumber", "숫자 포함 (0-9)") },
                        { ok: pwChecks.special, label: t("mypage.pwReqSpecial", "특수문자 포함 (!@#$ 등)") },
                      ].map((r, i) => (
                        <div key={i} className={`flex items-center gap-2 text-xs ${r.ok ? "text-emerald-600" : "text-muted-foreground"}`}>
                          {r.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                          <span>{r.label}</span>
                        </div>
                      ))}
                      <p className="text-[11px] text-muted-foreground pt-1.5 border-t border-border/60 mt-2">
                        {t("mypage.pwReqHint", "유출된 적이 있는 비밀번호(예: password, 12345678 등)는 사용할 수 없습니다.")}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("mypage.confirmPassword")}</label>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t("mypage.confirmPasswordPlaceholder")}
                        className="h-11 rounded-xl border-border pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={showConfirmPassword ? t("auth.hidePassword", "비밀번호 숨기기") : t("auth.showPassword", "비밀번호 보이기")}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {confirmPassword && newPassword !== confirmPassword && (
                      <p className="text-xs text-destructive">{t("mypage.passwordMismatch")}</p>
                    )}
                  </div>
                </div>
                <Button onClick={handleChangePassword} disabled={isChangingPw || !pwAllValid || newPassword !== confirmPassword} className="rounded-xl gap-1.5">
                  {isChangingPw ? t("common.processing") : t("mypage.changePassword")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </TabsContent>
          </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default MyPage;
