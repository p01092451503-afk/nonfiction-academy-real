import { useState } from "react";
import { User, Lock, Camera, ArrowRight, UserCircle, BookOpen, Trophy, Star, TrendingUp, Award, Download, Archive } from "lucide-react";
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
  const [isChangingPw, setIsChangingPw] = useState(false);

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
    if (newPassword.length < 6) {
      toast({ title: t("common.error"), description: t("mypage.passwordMinLength"), variant: "destructive" });
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
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
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
            <TabsContent value="password">
              <div className="max-w-lg space-y-6">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">{t("mypage.changePassword")}</h2>
                  <p className="text-sm text-muted-foreground">{t("mypage.changePasswordDesc")}</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("mypage.newPassword")}</label>
                    <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t("mypage.newPasswordPlaceholder")} className="h-11 rounded-xl border-border" minLength={6} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("mypage.confirmPassword")}</label>
                    <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t("mypage.confirmPasswordPlaceholder")} className="h-11 rounded-xl border-border" />
                  </div>
                </div>
                <Button onClick={handleChangePassword} disabled={isChangingPw || !newPassword} className="rounded-xl gap-1.5">
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
