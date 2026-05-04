import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatDistanceToNowStrict } from "date-fns";
import { ko, enUS, ja, zhCN } from "date-fns/locale";
import { Heart, Send, Trash2, Languages, Loader2, Image as ImageIcon, Smile } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import i18n from "@/i18n";
import { tryBrowserTranslate } from "@/lib/browserTranslator";

const QUICK_EMOJIS = ["❤️", "🙌", "🔥", "👏", "😢", "😍", "😮", "😂"];

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
  const { user, profile } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [translations, setTranslations] = useState<Record<string, { lang: string; text: string }>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [liked, setLiked] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`course-comment-likes:${courseId}`);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  });

  const persistLikes = (next: Set<string>) => {
    try {
      localStorage.setItem(`course-comment-likes:${courseId}`, JSON.stringify([...next]));
    } catch {
      // ignore
    }
  };

  const toggleLike = (id: string) => {
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistLikes(next);
      return next;
    });
  };

  const translateComment = async (c: CommentRow, target: string) => {
    if (translations[c.id]) {
      setTranslations((prev) => {
        const next = { ...prev };
        delete next[c.id];
        return next;
      });
      return;
    }
    if (c.language_code === target) return;
    setTranslatingId(c.id);
    try {
      const localResult = await tryBrowserTranslate(
        c.content,
        target as "ko" | "en" | "ja" | "zh-CN",
        c.language_code
      );
      if (localResult) {
        setTranslations((prev) => ({ ...prev, [c.id]: { lang: target, text: localResult } }));
        return;
      }
      const { data, error } = await supabase.functions.invoke("translate-comment", {
        body: { text: c.content, target, comment_id: c.id, source_lang: c.language_code },
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

  useEffect(() => {
    const uniqueId = `${courseId}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase.channel(`course-comments-${uniqueId}`);
    channel
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
    // 정렬: 내 댓글을 최상단(최신순) → 나머지는 최신순
    const sortedTop = [...top].sort((a, b) => {
      const aMine = user && a.user_id === user.id ? 1 : 0;
      const bMine = user && b.user_id === user.id ? 1 : 0;
      if (aMine !== bMine) return bMine - aMine;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return sortedTop.map((p) => ({ ...p, replies: childMap.get(p.id) || [] }));
  }, [comments, user]);

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
    onSuccess: (_d, vars) => {
      setDraft("");
      setReplyTo(null);
      // auto-expand replies after posting
      if (vars.parent_id) {
        setExpandedReplies((prev) => new Set(prev).add(vars.parent_id!));
      }
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

  const handleSubmit = () => {
    if (submitting || submitMutation.isPending) return;
    if (!user) {
      toast({ title: t("comments.signInRequired", "로그인이 필요합니다"), variant: "destructive" });
      return;
    }
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSubmitting(true);
    let content = trimmed;
    if (replyTo && !content.startsWith(`@${replyTo.name}`)) {
      content = `@${replyTo.name} ${content}`;
    }
    // Clear draft immediately so subsequent Enter/clicks can't resubmit the same text
    setDraft("");
    const parentId = replyTo?.id || null;
    setReplyTo(null);
    submitMutation.mutate({ content, parent_id: parentId });
  };

  const insertEmoji = (e: string) => {
    setDraft((prev) => prev + e);
  };

  const renderItem = (c: CommentWithProfile, isReply = false) => {
    const isOwner = user?.id === c.user_id;
    const name = c.profile?.full_name || t("comments.anonymous", "사용자");
    const initials = (name || "?").slice(0, 1).toUpperCase();
    const timeAgo = formatDistanceToNowStrict(new Date(c.created_at), {
      locale: localeFor(i18n.language),
    });
    const isLiked = liked.has(c.id);
    const tr = translations[c.id];
    const showingTranslation = !!tr;

    // Render @mentions as colored
    const renderContent = (text: string) => {
      const parts = text.split(/(@\S+)/g);
      return parts.map((p, i) =>
        p.startsWith("@") ? (
          <span key={i} className="text-[hsl(var(--primary))] font-medium">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        )
      );
    };

    return (
      <div key={c.id} className={`flex gap-3 px-5 sm:px-6 py-3 ${isReply ? "pl-16 sm:pl-20" : ""}`}>
        <Avatar className="h-9 w-9 shrink-0 ring-1 ring-border">
          <AvatarImage src={c.profile?.avatar_url || undefined} alt={name} />
          <AvatarFallback className="text-xs bg-muted">{initials}</AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="text-sm leading-snug">
            <span className="font-semibold text-foreground mr-2">{name}</span>
            <span className="text-muted-foreground text-xs">{timeAgo}</span>
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap break-words mt-0.5 leading-relaxed">
            {renderContent(showingTranslation ? tr.text : c.content)}
          </p>
          {showingTranslation && (
            <div className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Languages className="h-3 w-3" />
              <span>{t("comments.translatedBadge", "번역됨")} · {langBadge(tr.lang)}</span>
            </div>
          )}

          <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => {
                setReplyTo({ id: c.parent_id || c.id, name });
              }}
              className="hover:text-foreground transition-colors font-medium"
            >
              {t("comments.reply", "답글 달기")}
            </button>
            {(() => {
              const userLang = normalizeLang(i18n.language);
              const commentLang = c.language_code ? normalizeLang(c.language_code) : null;
              if (commentLang && commentLang === userLang) return null;
              return (
                <button
                  type="button"
                  disabled={translatingId === c.id}
                  onClick={() => translateComment(c, userLang)}
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {translatingId === c.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Languages className="h-3 w-3" />
                  )}
                  {translations[c.id]
                    ? t("comments.hideTranslation", "원문")
                    : t("comments.translateToMine", "번역")}
                </button>
              );
            })()}
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
        </div>

        {/* Right column: heart + count (Instagram-style) */}
        <button
          type="button"
          onClick={() => toggleLike(c.id)}
          className="flex flex-col items-center gap-0.5 shrink-0 pt-1 group"
          aria-label="like"
        >
          <Heart
            className={`h-4 w-4 transition-all ${
              isLiked
                ? "fill-rose-500 text-rose-500 scale-110"
                : "text-muted-foreground group-hover:text-foreground"
            }`}
          />
          {isLiked && (
            <span className="text-[10px] text-muted-foreground leading-none">1</span>
          )}
        </button>
      </div>
    );
  };

  const myAvatar = profile?.avatar_url || undefined;
  const myInitial = (profile?.full_name || user?.email || "?").slice(0, 1).toUpperCase();

  return (
    <section className="flex flex-col h-full min-h-0" aria-labelledby="course-comments-heading">
      {/* Header (Instagram bottom-sheet style) */}
      <div className="relative border-b border-border shrink-0">
        <h3
          id="course-comments-heading"
          className="text-center text-sm font-semibold text-foreground py-2.5"
        >
          {t("comments.title", "댓글")}
          {totalCount > 0 && (
            <span className="ml-1.5 text-muted-foreground font-normal">{totalCount}</span>
          )}
        </h3>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border/50">
        {isLoading ? (
          <p className="text-xs text-muted-foreground py-8 text-center">{t("common.loading", "불러오는 중...")}</p>
        ) : threads.length === 0 ? (
          <div className="py-12 text-center">
            <Heart className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground">
              {t("comments.emptyTitle", "아직 댓글이 없습니다")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("comments.empty", "첫 번째 댓글을 남겨보세요!")}
            </p>
          </div>
        ) : (
          <ul>
            {threads.map((c) => {
              const replies = c.replies || [];
              const isExpanded = expandedReplies.has(c.id);
              return (
                <li key={c.id}>
                  {renderItem(c, false)}
                  {replies.length > 0 && (
                    <div>
                      {!isExpanded ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedReplies((prev) => {
                              const next = new Set(prev);
                              next.add(c.id);
                              return next;
                            })
                          }
                          className="flex items-center gap-3 pl-16 sm:pl-20 pr-5 sm:pr-6 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <span className="h-px w-6 bg-border" />
                          {t("comments.viewMoreReplies", { count: replies.length, defaultValue: `답글 ${replies.length}개 더 보기` })}
                        </button>
                      ) : (
                        <>
                          <ul>
                            {replies.map((r) => (
                              <li key={r.id}>{renderItem(r, true)}</li>
                            ))}
                          </ul>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedReplies((prev) => {
                                const next = new Set(prev);
                                next.delete(c.id);
                                return next;
                              })
                            }
                            className="flex items-center gap-3 pl-16 sm:pl-20 pr-5 sm:pr-6 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <span className="h-px w-6 bg-border" />
                            {t("comments.hideReplies", "답글 숨기기")}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Quick emoji reaction bar */}
      {user && (
        <div className="shrink-0 flex items-center justify-around px-4 sm:px-6 py-2 border-t border-border bg-background">
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => insertEmoji(e)}
              className="text-xl hover:scale-125 transition-transform p-1"
              aria-label={`emoji ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Bottom composer (Instagram-style) */}
      {user ? (
        <div className="shrink-0 border-t border-border px-4 sm:px-6 pt-2.5 pb-[max(env(safe-area-inset-bottom),1rem)] bg-background">
          {replyTo && (
            <div className="flex items-center justify-between px-2 pb-2 text-[11px] text-muted-foreground">
              <span>
                {t("comments.replyingTo", { name: replyTo.name, defaultValue: `@${replyTo.name} 에게 답글 작성 중` })}
              </span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                {t("common.cancel", "취소")}
              </button>
            </div>
          )}
          <div className="flex items-center gap-2.5">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={myAvatar} alt="me" />
              <AvatarFallback className="text-[11px] bg-muted">{myInitial}</AvatarFallback>
            </Avatar>
            <div className="flex-1 flex items-center gap-1 rounded-full border border-border bg-muted/40 pl-4 pr-1 py-1 focus-within:border-foreground/40 transition-colors">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder={
                  replyTo
                    ? t("comments.replyPlaceholderShort", { name: replyTo.name, defaultValue: `@${replyTo.name} 에게 답글 추가...` })
                    : t("comments.placeholderShort", { name: profile?.full_name || "", defaultValue: "댓글 추가..." })
                }
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-0"
              />
              {draft.trim() && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmit}
                  className="text-sm font-semibold text-[hsl(var(--primary))] px-3 py-1 hover:opacity-70 transition-opacity disabled:opacity-40"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("comments.post", "게시")
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-4 border-t border-border">
          {t("comments.signInRequired", "로그인이 필요합니다")}
        </p>
      )}
    </section>
  );
};

export default CourseComments;
