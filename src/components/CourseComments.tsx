import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { ko, enUS, ja, zhCN } from "date-fns/locale";
import { MessageCircle, Send, Trash2, Reply, Heart, Languages, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import i18n from "@/i18n";

// Normalize i18n language to one of the supported translation targets
const normalizeLang = (lng: string): "ko" | "en" | "ja" | "zh-CN" => {
  if (!lng) return "en";
  if (lng.startsWith("ko")) return "ko";
  if (lng.startsWith("ja")) return "ja";
  if (lng.startsWith("zh")) return "zh-CN";
  return "en";
};

interface CommentRow {
  id: string;
  course_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  language_code: string | null;
  is_deleted: boolean;
  created_at: string;
}

interface CommentWithProfile extends CommentRow {
  profile?: { full_name: string | null; avatar_url: string | null };
  replies?: CommentWithProfile[];
}

const localeFor = (lng: string) => {
  if (lng.startsWith("ko")) return ko;
  if (lng.startsWith("ja")) return ja;
  if (lng.startsWith("zh")) return zhCN;
  return enUS;
};

const langBadge = (code: string | null): string => {
  if (!code) return "";
  if (code === "ko") return "KO";
  if (code === "en") return "EN";
  if (code === "ja") return "JA";
  if (code === "zh-CN" || code.startsWith("zh")) return "ZH";
  return code.toUpperCase();
};

interface Props {
  courseId: string;
}

const CourseComments = ({ courseId }: Props) => {
  const { t } = useTranslation();
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [translations, setTranslations] = useState<Record<string, { lang: string; text: string }>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);

  const translateComment = async (c: CommentRow, target: string) => {
    if (c.language_code === target) {
      setTranslations((prev) => {
        const next = { ...prev };
        delete next[c.id];
        return next;
      });
      return;
    }
    setTranslatingId(c.id);
    try {
      const { data, error } = await supabase.functions.invoke("translate-comment", {
        body: { text: c.content, target },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const translated = (data as any)?.translated as string;
      if (translated) {
        setTranslations((prev) => ({ ...prev, [c.id]: { lang: target, text: translated } }));
      }
    } catch (e: any) {
      toast({
        title: t("common.error", "오류"),
        description: e?.message || t("comments.translateFailed", "번역에 실패했습니다"),
        variant: "destructive",
      });
    } finally {
      setTranslatingId(null);
    }
  };

  const clearTranslation = (id: string) => {
    setTranslations((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const queryKey = ["course-comments", courseId];

  const { data: comments = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("course_comments" as any)
        .select("*")
        .eq("course_id", courseId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const list = (rows as unknown as CommentRow[]) || [];
      const userIds = [...new Set(list.map((r) => r.user_id))];
      let profiles: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name, avatar_url")
          .in("user_id", userIds);
        profiles = Object.fromEntries(
          (profs || []).map((p: any) => [p.user_id, { full_name: p.full_name, avatar_url: p.avatar_url }])
        );
      }
      return list.map((r) => ({ ...r, profile: profiles[r.user_id] })) as CommentWithProfile[];
    },
    staleTime: 30_000,
  });

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`course-comments-${courseId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "course_comments", filter: `course_id=eq.${courseId}` },
        () => {
          qc.invalidateQueries({ queryKey });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // Build threaded structure
  const threads = useMemo(() => {
    const top = comments.filter((c) => !c.parent_id);
    const childMap = new Map<string, CommentWithProfile[]>();
    comments.forEach((c) => {
      if (c.parent_id) {
        const arr = childMap.get(c.parent_id) || [];
        arr.push(c);
        childMap.set(c.parent_id, arr);
      }
    });
    return top.map((p) => ({ ...p, replies: childMap.get(p.id) || [] }));
  }, [comments]);

  const totalCount = comments.filter((c) => !c.is_deleted).length;

  const submitMutation = useMutation({
    mutationFn: async (payload: { content: string; parent_id: string | null }) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("course_comments" as any).insert({
        course_id: courseId,
        user_id: user.id,
        parent_id: payload.parent_id,
        content: payload.content.trim(),
        language_code: i18n.language || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      setReplyDraft("");
      setReplyTo(null);
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => {
      toast({
        title: t("common.error", "오류"),
        description: e.message || t("comments.notAllowed", "댓글을 작성할 수 없습니다. 수강 승인 여부를 확인해 주세요."),
        variant: "destructive",
      });
    },
    onSettled: () => setSubmitting(false),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("course_comments" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e: any) => toast({ title: t("common.error", "오류"), description: e.message, variant: "destructive" }),
  });

  const handleSubmit = (parent_id: string | null, text: string) => {
    if (!user) {
      toast({ title: t("comments.signInRequired", "로그인이 필요합니다"), variant: "destructive" });
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    setSubmitting(true);
    submitMutation.mutate({ content: trimmed, parent_id });
  };

  const renderItem = (c: CommentWithProfile, isReply = false) => {
    const isOwner = user?.id === c.user_id;
    const name = c.profile?.full_name || t("comments.anonymous", "사용자");
    const initials = (name || "?").slice(0, 1).toUpperCase();
    const timeAgo = formatDistanceToNow(new Date(c.created_at), {
      addSuffix: true,
      locale: localeFor(i18n.language),
    });

    return (
      <div key={c.id} className={`flex gap-3 ${isReply ? "pl-10" : ""}`}>
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={c.profile?.avatar_url || undefined} alt={name} />
          <AvatarFallback className="text-xs bg-muted">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{name}</span>
            <span className="text-[11px] text-muted-foreground">{timeAgo}</span>
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap break-words mt-0.5 leading-relaxed">
            {c.content}
          </p>
          {translations[c.id] && (
            <div className="mt-2 rounded-md border border-border/70 bg-muted/40 p-2">
              <div className="flex items-center gap-1.5 mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                <Languages className="h-3 w-3" />
                <span>{langBadge(translations[c.id].lang)}</span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
                {translations[c.id].text}
              </p>
              <button
                type="button"
                onClick={() => clearTranslation(c.id)}
                className="mt-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("comments.hideTranslation", "원문 보기")}
              </button>
            </div>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
            {!isReply && (
              <button
                type="button"
                onClick={() => {
                  setReplyTo({ id: c.id, name });
                  setReplyDraft("");
                }}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <Reply className="h-3 w-3" />
                {t("comments.reply", "답글")}
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={translatingId === c.id}
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {translatingId === c.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Languages className="h-3 w-3" />
                  )}
                  {t("comments.translate", "번역")}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[140px]">
                {TRANSLATE_LANGS.map((l) => (
                  <DropdownMenuItem
                    key={l.code}
                    onClick={() => translateComment(c, l.code)}
                    className="text-xs cursor-pointer"
                  >
                    <span className="font-mono text-[10px] text-muted-foreground mr-2">
                      {langBadge(l.code)}
                    </span>
                    {l.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {isOwner && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(t("comments.confirmDelete", "이 댓글을 삭제하시겠습니까?"))) {
                    deleteMutation.mutate(c.id);
                  }
                }}
                className="inline-flex items-center gap-1 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                {t("common.delete", "삭제")}
              </button>
            )}
          </div>

          {/* Inline reply composer */}
          {replyTo?.id === c.id && (
            <div className="mt-3 flex gap-2">
              <Textarea
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                placeholder={t("comments.replyPlaceholder", { name, defaultValue: `@${name} 에게 답글 달기...` })}
                className="min-h-[60px] text-sm rounded-lg resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSubmit(c.id, replyDraft);
                  }
                }}
              />
              <div className="flex flex-col gap-1.5">
                <Button
                  size="sm"
                  className="rounded-lg gap-1 h-8 px-3"
                  disabled={!replyDraft.trim() || submitting}
                  onClick={() => handleSubmit(c.id, replyDraft)}
                >
                  <Send className="h-3 w-3" />
                  {t("comments.post", "게시")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-lg h-8 px-3 text-xs"
                  onClick={() => {
                    setReplyTo(null);
                    setReplyDraft("");
                  }}
                >
                  {t("common.cancel", "취소")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="border-t border-border pt-6 mt-6 space-y-4" aria-labelledby="course-comments-heading">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-muted-foreground" />
        <h3 id="course-comments-heading" className="text-sm font-semibold text-foreground">
          {t("comments.title", "댓글")}
        </h3>
        <span className="text-xs text-muted-foreground">{totalCount}</span>
      </div>

      {/* Composer (top-level) */}
      {user ? (
        <div className="flex gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("comments.placeholder", "이 강의에 대한 의견을 남겨보세요...")}
            className="min-h-[60px] text-sm rounded-lg resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit(null, draft);
              }
            }}
          />
          <Button
            className="rounded-lg gap-1 h-auto px-4 self-stretch"
            disabled={!draft.trim() || submitting}
            onClick={() => handleSubmit(null, draft)}
          >
            <Send className="h-4 w-4" />
            {t("comments.post", "게시")}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("comments.signInRequired", "로그인이 필요합니다")}</p>
      )}

      {/* List */}
      {isLoading ? (
        <p className="text-xs text-muted-foreground py-4">{t("common.loading", "불러오는 중...")}</p>
      ) : threads.length === 0 ? (
        <div className="py-8 text-center">
          <Heart className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            {t("comments.empty", "아직 댓글이 없습니다. 첫 번째 댓글을 남겨보세요!")}
          </p>
        </div>
      ) : (
        <ul className="space-y-5">
          {threads.map((c) => (
            <li key={c.id} className="space-y-3">
              {renderItem(c, false)}
              {c.replies && c.replies.length > 0 && (
                <ul className="space-y-3">
                  {c.replies.map((r) => (
                    <li key={r.id}>{renderItem(r, true)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default CourseComments;
