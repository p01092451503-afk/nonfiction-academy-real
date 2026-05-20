import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, GripVertical, Video as VideoIcon, Search, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import type { VideoPackageItemDraft } from "@/lib/videoPackageTypes";
import { VideoThumbnail } from "@/components/VideoThumbnail";

interface Props {
  items: VideoPackageItemDraft[];
  onChange: (items: VideoPackageItemDraft[]) => void;
}

interface VideoAssetRow {
  id: string;
  title: string;
  video_url: string;
  video_provider: string;
  thumbnail_url: string | null;
  duration_minutes: number | null;
}

const VideoPackageItemsEditor = ({ items, onChange }: Props) => {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["video-assets-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("video_assets")
        .select("id, title, video_url, video_provider, thumbnail_url, duration_minutes")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as VideoAssetRow[];
    },
    enabled: pickerOpen,
  });

  const filtered = assets.filter((a) =>
    a.title.toLowerCase().includes(search.toLowerCase())
  );

  const addSelected = () => {
    const picked = assets.filter((a) => selected.has(a.id));
    const next: VideoPackageItemDraft[] = [
      ...items,
      ...picked.map((a) => ({
        tempId: crypto.randomUUID(),
        video_asset_id: a.id,
        video_url: a.video_url,
        video_provider: a.video_provider,
        thumbnail_url: a.thumbnail_url,
        duration_seconds: a.duration_minutes ? a.duration_minutes * 60 : null,
        title: a.title,
      })),
    ];
    onChange(next);
    setSelected(new Set());
    setSearch("");
    setPickerOpen(false);
  };

  const removeItem = (tempId: string) => {
    onChange(items.filter((it) => it.tempId !== tempId));
  };

  const updateTitle = (tempId: string, title: string) => {
    onChange(items.map((it) => (it.tempId === tempId ? { ...it, title } : it)));
  };

  const move = (idx: number, dir: -1 | 1) => {
    const ni = idx + dir;
    if (ni < 0 || ni >= items.length) return;
    const next = [...items];
    [next[idx], next[ni]] = [next[ni], next[idx]];
    onChange(next);
  };

  const addManualUrl = () => {
    onChange([
      ...items,
      {
        tempId: crypto.randomUUID(),
        video_asset_id: null,
        video_url: "",
        video_provider: "custom",
        thumbnail_url: null,
        duration_seconds: null,
        title: "",
      },
    ]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">
          {t("videoPackage.editorHint", "이 차시(언어)에 재생할 동영상을 순서대로 추가하세요.")}
        </p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addManualUrl}>
            <Plus className="h-3 w-3" /> URL
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setPickerOpen(true)}>
            <VideoIcon className="h-3 w-3" /> {t("videoPackage.pickFromLibrary", "라이브러리에서 선택")}
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
          {t("videoPackage.noItems", "추가된 동영상이 없습니다")}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, idx) => (
            <li key={it.tempId} className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2">
              <div className="flex flex-col">
                <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 leading-none">▲</button>
                <button type="button" onClick={() => move(idx, 1)} disabled={idx === items.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 leading-none">▼</button>
              </div>
              <span className="text-xs font-semibold text-muted-foreground w-6 text-center tabular-nums">{idx + 1}</span>
              <VideoThumbnail src={it.thumbnail_url} className="h-9 w-12 rounded shrink-0" />
              <div className="flex-1 min-w-0 space-y-1">
                <Input
                  value={it.title || ""}
                  onChange={(e) => updateTitle(it.tempId, e.target.value)}
                  placeholder={t("videoPackage.titlePh", "동영상 제목")}
                  className="h-7 text-xs"
                />
                {!it.video_asset_id && (
                  <Input
                    value={it.video_url}
                    onChange={(e) =>
                      onChange(items.map((x) => (x.tempId === it.tempId ? { ...x, video_url: e.target.value } : x)))
                    }
                    placeholder="https://.../playlist.m3u8 또는 mp4 URL"
                    className="h-7 text-xs font-mono"
                  />
                )}
              </div>
              {it.video_provider && (
                <Badge variant="outline" className="text-[10px] shrink-0">{it.video_provider}</Badge>
              )}
              <button type="button" onClick={() => removeItem(it.tempId)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{t("videoPackage.pickFromLibrary", "라이브러리에서 선택")}</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("common.search", "검색")} className="pl-9 h-9 text-sm" />
          </div>
          <ScrollArea className="h-[50vh] -mx-2 px-2">
            {isLoading ? (
              <p className="text-xs text-muted-foreground py-8 text-center">{t("common.loading", "불러오는 중...")}</p>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">{t("common.noData", "데이터가 없습니다")}</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {filtered.map((a) => {
                  const isSel = selected.has(a.id);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(a.id)) next.delete(a.id);
                            else next.add(a.id);
                            return next;
                          });
                        }}
                        className={`w-full flex items-center gap-3 px-2 py-2 text-left transition-colors ${isSel ? "bg-accent" : "hover:bg-accent/50"}`}
                      >
                        <div className={`h-5 w-5 rounded border flex items-center justify-center ${isSel ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
                          {isSel && <Check className="h-3 w-3" />}
                        </div>
                        <VideoThumbnail src={a.thumbnail_url} className="h-9 w-14 rounded shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{a.title}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{a.video_url}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">{a.video_provider}</Badge>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setPickerOpen(false); setSelected(new Set()); }}>
              {t("common.cancel", "취소")}
            </Button>
            <Button type="button" disabled={selected.size === 0} onClick={addSelected}>
              {t("common.add", "추가")} ({selected.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VideoPackageItemsEditor;
