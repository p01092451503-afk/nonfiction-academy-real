import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Bell, Send, Users, User } from "lucide-react";
import { format } from "date-fns";
import { buildNotificationI18n, type NotificationI18n } from "@/lib/notificationI18n";
import MultilingualTextFields, { EMPTY_MULTILINGUAL, type MultilingualValue } from "@/components/admin/MultilingualTextFields";

const TeacherNotifications = () => {
  const { t } = useTranslation();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<"all" | "individual">("all");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [ml, setMl] = useState<MultilingualValue>(EMPTY_MULTILINGUAL);
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [searchUser, setSearchUser] = useState("");

  // Fetch students enrolled in teacher's courses
  const { data: students } = useQuery({
    queryKey: ["teacher-students-for-notify", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: courses } = await supabase
        .from("courses")
        .select("id")
        .eq("instructor_id", user!.id);
      if (!courses?.length) return [];
      const courseIds = courses.map((c) => c.id);
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("user_id")
        .in("course_id", courseIds)
        .eq("status", "approved");
      if (!enrollments?.length) return [];
      const uniqueIds = [...new Set(enrollments.map((e) => e.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, department")
        .in("user_id", uniqueIds);
      return profiles || [];
    },
  });

  const { data: recentNotifications } = useQuery({
    queryKey: ["teacher-recent-notifications"],
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const koTitle = ml.ko.title.trim();
      const koMessage = ml.ko.content.trim();
      if (!koTitle || !koMessage) throw new Error(t("notifications.koRequired", "한국어 제목/내용을 입력하세요."));

      let title_i18n: NotificationI18n;
      let message_i18n: NotificationI18n;
      if (autoTranslate) {
        ({ title_i18n, message_i18n } = await buildNotificationI18n(koTitle, koMessage));
      } else {
        title_i18n = {
          ko: koTitle,
          en: ml.en.title.trim() || koTitle,
          ja: ml.ja.title.trim() || koTitle,
          "zh-CN": ml["zh-CN"].title.trim() || koTitle,
        };
        message_i18n = {
          ko: koMessage,
          en: ml.en.content.trim() || koMessage,
          ja: ml.ja.content.trim() || koMessage,
          "zh-CN": ml["zh-CN"].content.trim() || koMessage,
        };
      }

      if (target === "all") {
        const ids = students?.map((s) => s.user_id) || [];
        const rows = ids.map((uid) => ({ user_id: uid, title: koTitle, message: koMessage, type: "info", title_i18n, message_i18n }));
        if (rows.length === 0) throw new Error(t("notifications.noRecipients", "발송 대상이 없습니다."));
        const { error } = await supabase.from("notifications").insert(rows);
        if (error) throw error;
      } else {
        if (!selectedUserId) throw new Error(t("notifications.selectRecipient", "대상을 선택해주세요."));
        const { error } = await supabase.from("notifications").insert({ user_id: selectedUserId, title: koTitle, message: koMessage, type: "info", title_i18n, message_i18n });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: t("notifications.sent", "알림 발송 완료") });
      queryClient.invalidateQueries({ queryKey: ["teacher-recent-notifications"] });
      setOpen(false);
      setMl(EMPTY_MULTILINGUAL);
      setSelectedUserId("");
    },
    onError: (err: Error) => toast({ title: t("common.error", "오류"), description: err.message, variant: "destructive" }),
  });

  const filteredStudents = students?.filter(
    (s) =>
      !searchUser ||
      s.full_name?.toLowerCase().includes(searchUser.toLowerCase()) ||
      s.email?.toLowerCase().includes(searchUser.toLowerCase())
  );

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2"><Bell className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />{t("notifications.management", "알림 관리")}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("notifications.teacherDesc", "수강생에게 알림을 발송합니다.")}</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Send className="h-4 w-4 mr-2" />{t("notifications.send", "알림 발송")}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t("notifications.send", "알림 발송")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>{t("notifications.target", "발송 대상")}</Label>
                  <Select value={target} onValueChange={(v) => setTarget(v as "all" | "individual")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all"><Users className="inline h-4 w-4 mr-1" />{t("notifications.myStudents", "내 수강생 전체")}</SelectItem>
                      <SelectItem value="individual"><User className="inline h-4 w-4 mr-1" />{t("notifications.individual", "개별 학생")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {target === "individual" && (
                  <div>
                    <Label>{t("notifications.selectStudent", "학생 선택")}</Label>
                    <Input placeholder={t("common.search")} value={searchUser} onChange={(e) => setSearchUser(e.target.value)} className="mb-2" />
                    <div className="max-h-40 overflow-y-auto border rounded-md">
                      {filteredStudents?.map((s) => (
                        <button
                          key={s.user_id}
                          onClick={() => setSelectedUserId(s.user_id)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${selectedUserId === s.user_id ? "bg-accent font-medium" : ""}`}
                        >
                          {s.full_name || s.email} {s.department && <span className="text-muted-foreground">({s.department})</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <MultilingualTextFields
                  value={ml}
                  onChange={setMl}
                  contentRows={4}
                  autoTranslate={autoTranslate}
                  onAutoTranslateChange={setAutoTranslate}
                />
                <Button onClick={() => sendMutation.mutate()} disabled={!ml.ko.title.trim() || !ml.ko.content.trim() || sendMutation.isPending} className="w-full">
                  {sendMutation.isPending ? t("common.processing") : t("notifications.send", "알림 발송")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />{t("notifications.recentSent", "최근 발송 내역")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("notifications.title", "제목")}</TableHead>
                  <TableHead>{t("notifications.message", "내용")}</TableHead>
                  <TableHead>{t("notifications.sentAt", "발송일시")}</TableHead>
                  <TableHead>{t("notifications.readStatus", "읽음")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentNotifications?.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{t("common.noData")}</TableCell></TableRow>
                )}
                {recentNotifications?.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium">{n.title}</TableCell>
                    <TableCell className="max-w-[300px] truncate">{n.message}</TableCell>
                    <TableCell>{format(new Date(n.created_at!), "yyyy-MM-dd HH:mm")}</TableCell>
                    <TableCell>{n.is_read ? "✓" : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default TeacherNotifications;
