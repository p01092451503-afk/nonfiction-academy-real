import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  GripVertical, ChevronUp, ChevronDown, Trash2, ArrowUpAZ,
  Image as ImageIcon, Video as VideoIcon, RotateCcw, Upload,
} from "lucide-react";

export interface QueueFile {
  id: string;
  file: File;
  previewUrl: string; // object URL for thumbnail
  kind: "image" | "video";
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  files: File[];
  onConfirm: (orderedFiles: File[]) => void;
}

// Natural sort: img2.jpg < img10.jpg
const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

export default function UploadOrderQueueDialog({ open, onOpenChange, files, onConfirm }: Props) {
  const [items, setItems] = useState<QueueFile[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [originalOrder, setOriginalOrder] = useState<QueueFile[]>([]);

  // Build queue from incoming files
  useEffect(() => {
    if (!open) return;
    const built: QueueFile[] = files.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      previewUrl: URL.createObjectURL(f),
      kind: f.type.startsWith("video/") ? "video" : "image",
    }));
    setItems(built);
    setOriginalOrder(built);
    return () => {
      built.forEach((b) => URL.revokeObjectURL(b.previewUrl));
    };
  }, [open, files]);

  const totalSize = useMemo(
    () => items.reduce((s, i) => s + i.file.size, 0),
    [items],
  );

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    const next = [...items];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setItems(next);
  };

  const remove = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const sortByName = () => {
    setItems((prev) => [...prev].sort((a, b) => naturalCompare(a.file.name, b.file.name)));
  };

  const restore = () => setItems(originalOrder);

  const formatSize = (b: number) =>
    b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" />
            업로드 순서 확정 ({items.length}개 · {formatSize(totalSize)})
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
          <p className="text-[11px] text-muted-foreground">
            드래그·↑↓ 버튼·번호 정렬로 순서를 정한 뒤 [업로드 시작]을 누르세요. 위에서 아래 순서대로 업로드됩니다.
          </p>
          <div className="flex gap-1.5 shrink-0">
            <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={sortByName}>
              <ArrowUpAZ className="h-3 w-3" /> 파일명 정렬
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px] gap-1" onClick={restore}>
              <RotateCcw className="h-3 w-3" /> 원래 순서
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {items.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-8">파일이 없습니다.</p>
          )}
          {items.map((it, idx) => {
            const isDragging = dragIndex === idx;
            const isOver = overIndex === idx && dragIndex !== null && dragIndex !== idx;
            return (
              <div
                key={it.id}
                draggable
                onDragStart={() => setDragIndex(idx)}
                onDragOver={(e) => { e.preventDefault(); setOverIndex(idx); }}
                onDragLeave={() => setOverIndex((v) => (v === idx ? null : v))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) move(dragIndex, idx);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
                className={[
                  "flex items-center gap-2 rounded-lg border bg-background p-2 transition-all min-w-0",
                  isDragging ? "opacity-40 border-primary" : "border-border",
                  isOver ? "border-primary border-t-4" : "",
                ].join(" ")}
              >
                <button type="button" className="cursor-grab text-muted-foreground hover:text-foreground" title="드래그하여 순서 변경">
                  <GripVertical className="h-4 w-4" />
                </button>
                <span className="text-[11px] font-semibold text-foreground tabular-nums w-7 text-center bg-muted rounded">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <div className="shrink-0 h-12 w-12 rounded border border-border overflow-hidden bg-muted/30 flex items-center justify-center">
                  {it.kind === "image" ? (
                    <img src={it.previewUrl} alt={it.file.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <VideoIcon className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{it.file.name}</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    {it.kind === "image" ? <ImageIcon className="h-2.5 w-2.5" /> : <VideoIcon className="h-2.5 w-2.5" />}
                    {formatSize(it.file.size)}
                  </p>
                </div>
                <button type="button" onClick={() => move(idx, idx - 1)} disabled={idx === 0}
                  className="p-1 rounded hover:bg-accent text-muted-foreground disabled:opacity-30" title="위로">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => move(idx, idx + 1)} disabled={idx === items.length - 1}
                  className="p-1 rounded hover:bg-accent text-muted-foreground disabled:opacity-30" title="아래로">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => remove(idx)}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="제거">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button
            type="button"
            disabled={items.length === 0}
            onClick={() => {
              onConfirm(items.map((i) => i.file));
              onOpenChange(false);
            }}
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            이 순서로 업로드 시작 ({items.length}개)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
