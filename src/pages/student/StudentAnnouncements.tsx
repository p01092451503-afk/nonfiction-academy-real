import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Megaphone, Pin, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { pickTranslation } from "@/lib/i18nContent";

const StudentAnnouncements = () => {
  const { t, i18n } = useTranslation();
  const [selectedAnn, setSelectedAnn] = useState<any>(null);
  const lang = i18n.language?.startsWith("en") ? "en" : "ko";

  const { data: announcements, isLoading } = useQuery({
    queryKey: ["student-announcements"],
    queryFn: async () => {
      const { data } = await supabase
        .from("announcements")
        .select("*, announcement_i18n(language_code, title, content)")
        .eq("is_published", true)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      return (data || []).map((a: any) => {
        const localized = pickTranslation(a.announcement_i18n, lang, { title: a.title, content: a.content });
        return { ...a, displayTitle: localized.title, displayContent: localized.content };
      });
    },
  });

  const { data: authorProfiles } = useQuery({
    queryKey: ["announcement-authors-student", announcements?.map((a) => a.author_id)],
    enabled: !!announcements?.length,
    queryFn: async () => {
      const ids = [...new Set(announcements!.map((a) => a.author_id))];
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
      return Object.fromEntries((data || []).map((p) => [p.user_id, p.full_name]));
    },
  });

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6" />
            {t("announcements.title", "공지사항")}
          </h1>
          <p className="text-muted-foreground">{t("announcements.studentDesc", "중요한 공지 및 안내사항을 확인하세요.")}</p>
        </div>

        {isLoading ? (
          <div className="space-y-3" role="status" aria-live="polite">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : announcements?.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {t("announcements.noAnnouncements", "등록된 공지사항이 없습니다.")}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {announcements?.map((ann) => (
              <Card
                key={ann.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedAnn(ann)}
              >
                <CardContent className="flex items-center gap-4 py-4">
                  {ann.is_pinned && <Pin className="h-4 w-4 text-primary shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {ann.is_pinned && (
                        <Badge variant="outline" className="text-xs shrink-0">{t("announcements.pinned", "고정")}</Badge>
                      )}
                      <h3 className="font-medium truncate">{ann.displayTitle}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{ann.displayContent}</p>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(ann.created_at), "yyyy-MM-dd")}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selectedAnn} onOpenChange={() => setSelectedAnn(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedAnn?.displayTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{authorProfiles?.[selectedAnn?.author_id] || "—"}</span>
              <span>·</span>
              <span>{selectedAnn && format(new Date(selectedAnn.created_at), "yyyy-MM-dd HH:mm")}</span>
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed border-t pt-4">
              {selectedAnn?.displayContent}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StudentAnnouncements;
