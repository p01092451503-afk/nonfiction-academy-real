import { useState } from "react";
import { Search, CheckCircle2, XCircle, Clock, Users, BookOpen, Filter, UserPlus, Trash2 } from "lucide-react";
import BulkEnrollDialog from "@/components/admin/BulkEnrollDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import StatCard from "@/components/ui/stat-card";
import { useDashboardSparklines, computeDelta } from "@/hooks/useDashboardSparklines";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAllPaged } from "@/lib/fetchAllPaged";

const AdminEnrollments = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [bulkOpen, setBulkOpen] = useState(false);


  // Fetch enrollments with course info (paginated to bypass Supabase 1000-row default limit)
  const { data: enrollments = [], isLoading } = useQuery({
    queryKey: ["admin-enrollments"],
    queryFn: async () =>
      await fetchAllPaged<any>((from, to) =>
        supabase
          .from("enrollments")
          .select("*, courses(id, title, thumbnail_url, category_id)")
          .order("enrolled_at", { ascending: false })
          .range(from, to),
      ),
  });

  // Fetch student profiles
  const userIds = [...new Set(enrollments.map((e: any) => e.user_id))];
  const { data: profiles = [] } = useQuery({
    queryKey: ["enrollment-profiles", userIds],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, department, position")
        .in("user_id", userIds);
      if (error) throw error;
      return data;
    },
    enabled: userIds.length > 0,
  });

  const profileMap = new Map(profiles.map((p: any) => [p.user_id, p]));

  // Approve/reject mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ enrollmentId, newStatus }: { enrollmentId: string; newStatus: "approved" | "rejected" }) => {
      const { error } = await supabase
        .from("enrollments")
        .update({
          status: newStatus,
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", enrollmentId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-enrollments"] });
      const msg = variables.newStatus === "approved" ? t("enrollment.approved") : t("enrollment.rejected");
      toast({ title: msg });
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  // Batch approve
  const batchApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("enrollments")
        .update({
          status: "approved",
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
        })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-enrollments"] });
      toast({ title: t("enrollment.batchApproved") });
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  // 승인된 수강 취소 (enrollment 레코드 삭제)
  const cancelEnrollmentMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { error } = await supabase.from("enrollments").delete().eq("id", enrollmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-enrollments"] });
      toast({ title: "수강이 취소되었습니다." });
    },
    onError: (e: any) => {
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });


  const filtered = enrollments.filter((e: any) => {
    const profile = profileMap.get(e.user_id);
    const matchSearch =
      e.courses?.title?.toLowerCase().includes(search.toLowerCase()) ||
      profile?.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const pendingCount = enrollments.filter((e: any) => e.status === "pending").length;
  const approvedCount = enrollments.filter((e: any) => e.status === "approved").length;
  const rejectedCount = enrollments.filter((e: any) => e.status === "rejected").length;
  const pendingIds = filtered.filter((e: any) => e.status === "pending").map((e: any) => e.id);
  const { data: enrollSpark } = useDashboardSparklines(14);

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-300 bg-amber-50"><Clock className="h-2.5 w-2.5" />{t("enrollment.pending")}</Badge>;
      case "approved":
        return <Badge variant="outline" className="text-[10px] gap-1 text-green-600 border-green-300 bg-green-50"><CheckCircle2 className="h-2.5 w-2.5" />{t("enrollment.approvedStatus")}</Badge>;
      case "rejected":
        return <Badge variant="outline" className="text-[10px] gap-1 text-destructive border-destructive/30 bg-destructive/5"><XCircle className="h-2.5 w-2.5" />{t("enrollment.rejectedStatus")}</Badge>;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2"><Users className="h-6 w-6" aria-hidden="true" />{t("enrollment.management")}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{t("enrollment.managementDesc")}</p>
          </div>
          <Button onClick={() => setBulkOpen(true)} className="rounded-xl gap-1.5 w-full sm:w-auto">
            <UserPlus className="h-4 w-4" /> 일괄 수강 승인
          </Button>
        </div>


        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label={t("enrollment.pendingCount")} value={pendingCount} icon={Clock} tone="warning" />
          <StatCard label={t("enrollment.approvedCount")} value={approvedCount} icon={CheckCircle2} tone="success" trend={(enrollSpark?.enrollments ?? []).slice(-7)} delta={computeDelta(enrollSpark?.enrollments)} />
          <StatCard label={t("enrollment.rejectedCount")} value={rejectedCount} icon={XCircle} tone="danger" />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("enrollment.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl border-border"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-24 sm:w-32 rounded-xl h-10">
              <div className="flex items-center gap-1.5"><Filter className="h-3.5 w-3.5" /><SelectValue /></div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              <SelectItem value="pending">{t("enrollment.pending")}</SelectItem>
              <SelectItem value="approved">{t("enrollment.approvedStatus")}</SelectItem>
              <SelectItem value="rejected">{t("enrollment.rejectedStatus")}</SelectItem>
            </SelectContent>
          </Select>
          {pendingIds.length > 0 && (
            <Button
              size="sm"
              className="rounded-xl gap-1.5 text-xs sm:text-sm"
              onClick={() => batchApproveMutation.mutate(pendingIds)}
              disabled={batchApproveMutation.isPending}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("enrollment.approveAll")}</span>
              <span className="sm:hidden">{t("enrollment.approve")}</span>
              ({pendingIds.length})
            </Button>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3" role="status" aria-live="polite">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="stat-card text-center py-16">
            <Users className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground mt-3">{t("enrollment.noEnrollments")}</p>
          </div>
        ) : (
          <div className="stat-card !p-0 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">{t("enrollment.student")}</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">{t("enrollment.course")}</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">{t("enrollment.status")}</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">{t("enrollment.requestDate")}</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">{t("enrollment.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((enrollment: any) => {
                  const profile = profileMap.get(enrollment.user_id);
                  const course = enrollment.courses;

                  return (
                    <tr key={enrollment.id} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{profile?.full_name || "-"}</p>
                          <p className="text-[11px] text-muted-foreground">{profile?.department || ""} {profile?.position || ""}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          {course?.thumbnail_url ? (
                            <img src={course.thumbnail_url} alt="" className="h-8 w-12 rounded object-cover shrink-0" />
                          ) : (
                            <div className="h-8 w-12 rounded bg-secondary flex items-center justify-center shrink-0">
                              <BookOpen className="h-3 w-3 text-muted-foreground" />
                            </div>
                          )}
                          <span className="text-xs text-foreground truncate max-w-[200px]">{course?.title || "-"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">{statusBadge(enrollment.status)}</td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {enrollment.enrolled_at ? new Date(enrollment.enrolled_at).toLocaleDateString() : "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {enrollment.status === "pending" ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-lg text-xs gap-1 text-green-600 border-green-300 hover:bg-green-50"
                              onClick={() => updateStatusMutation.mutate({ enrollmentId: enrollment.id, newStatus: "approved" })}
                              disabled={updateStatusMutation.isPending}
                            >
                              <CheckCircle2 className="h-3 w-3" /> {t("enrollment.approve")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-lg text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/5"
                              onClick={() => updateStatusMutation.mutate({ enrollmentId: enrollment.id, newStatus: "rejected" })}
                              disabled={updateStatusMutation.isPending}
                            >
                              <XCircle className="h-3 w-3" /> {t("enrollment.reject")}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-muted-foreground">
                              {enrollment.reviewed_at ? new Date(enrollment.reviewed_at).toLocaleDateString() : "-"}
                            </span>
                            {enrollment.status === "approved" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 rounded-lg text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/5"
                                onClick={() => {
                                  if (window.confirm("해당 학습자의 수강 승인을 취소하시겠습니까? 수강 이력이 삭제됩니다.")) {
                                    cancelEnrollmentMutation.mutate(enrollment.id);
                                  }
                                }}
                                disabled={cancelEnrollmentMutation.isPending}
                              >
                                <Trash2 className="h-3 w-3" /> 수강 취소
                              </Button>
                            )}
                          </div>
                        )}

                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <BulkEnrollDialog open={bulkOpen} onOpenChange={setBulkOpen} />
    </>
  );
};

export default AdminEnrollments;
