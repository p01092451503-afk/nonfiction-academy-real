import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Pin, FileText, Eye, Download, ClipboardList } from "lucide-react";
import BoardComments from "@/components/BoardComments";
import { pickTranslation } from "@/lib/i18nContent";
import { Skeleton } from "@/components/ui/skeleton";

const StudentBoard = () => {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const lang = i18n.language?.startsWith("en") ? "en" : "ko";

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["board-posts-student", lang],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("board_posts")
        .select("*, board_post_i18n(language_code, title, content)")
        .eq("is_published", true)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((p: any) => {
        const localized = pickTranslation(p.board_post_i18n, lang, { title: p.title, content: p.content });
        return { ...p, displayTitle: localized.title, displayContent: localized.content };
      });
    },
  });

  const viewMutation = useMutation({
    mutationFn: async (post: any) => {
      // Increment view count
      await supabase.from("board_posts").update({ view_count: (post.view_count || 0) + 1 }).eq("id", post.id);
      return post;
    },
    onSuccess: (post) => {
      setSelected({ ...post, view_count: (post.view_count || 0) + 1 });
      qc.invalidateQueries({ queryKey: ["board-posts-student"] });
    },
  });

  const getFileName = (url: string) => {
    try {
      const parts = url.split("/");
      return parts[parts.length - 1].replace(/^\d+_/, "");
    } catch { return url; }
  };

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            {t("board.studentTitle", "게시판")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("board.studentSubtitle", "교육 자료 및 안내사항을 확인하세요.")}</p>
        </div>

        {isLoading ? (
          <div className="space-y-3" role="status" aria-live="polite">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : posts.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("common.noData")}</p>
        ) : (
          <div className="space-y-2">
            {posts.map(post => (
              <Card key={post.id} className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => viewMutation.mutate(post)}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {post.is_pinned && <Pin className="h-3.5 w-3.5 text-primary shrink-0" />}
                    <span className="font-medium text-foreground">{post.displayTitle}</span>
                    {(post.target_countries?.length || 0) > 0 && (
                      <Badge variant="outline" className="text-[10px]">🌐 {post.target_countries.join(", ")}</Badge>
                    )}
                    {(post.target_course_ids?.length || 0) > 0 && (
                      <Badge variant="outline" className="text-[10px]">{t("board.course", "강의")}</Badge>
                    )}
                    {(post.file_urls?.length || 0) > 0 && (
                      <Badge variant="outline" className="text-[10px] gap-0.5"><FileText className="h-2.5 w-2.5" />{post.file_urls.length}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                    <span>{new Date(post.created_at).toLocaleDateString()}</span>
                    <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" />{post.view_count}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={v => { if (!v) setSelected(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{selected?.displayTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              {selected && new Date(selected.created_at).toLocaleString()}
              <span className="ml-3 inline-flex items-center gap-0.5"><Eye className="h-3 w-3" />{selected?.view_count}</span>
            </div>
            <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{selected?.displayContent}</div>
            {(selected?.file_urls?.length || 0) > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground">{t("board.attachments", "첨부파일")}</p>
                {selected.file_urls.map((url: string, i: number) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs bg-muted rounded px-3 py-2 hover:bg-accent transition-colors">
                    <Download className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate">{getFileName(url)}</span>
                  </a>
                ))}
              </div>
            )}
            {selected && <BoardComments postId={selected.id} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StudentBoard;
