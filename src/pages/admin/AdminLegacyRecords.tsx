import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Archive, Upload, Download, Trash2, Search } from "lucide-react";
import { useUser } from "@/contexts/UserContext";

interface ParsedRow {
  email: string;
  course_title: string;
  course_title_en?: string;
  is_completed: boolean;
  completed_at?: string | null;
  source_lms?: string;
  source_course_id?: string;
  notes?: string;
}

const parseCSV = (text: string): ParsedRow[] => {
  // Strip BOM
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const split = (line: string) => {
    // Simple CSV: handle quoted commas
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === "," && !inQ) {
        out.push(cur); cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = split(lines[0]).map((h) => h.toLowerCase());
  const idx = (k: string) => headers.indexOf(k);
  const iEmail = idx("email");
  const iTitle = idx("course_title");
  const iTitleEn = idx("course_title_en");
  const iComp = idx("is_completed");
  const iDate = idx("completed_at");
  const iLms = idx("source_lms");
  const iSrcId = idx("source_course_id");
  const iNotes = idx("notes");
  if (iEmail < 0 || iTitle < 0) {
    throw new Error("CSV에 email, course_title 컬럼이 필요합니다.");
  }
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = split(lines[i]);
    const completedRaw = (iComp >= 0 ? cols[iComp] : "").toLowerCase();
    rows.push({
      email: cols[iEmail],
      course_title: cols[iTitle],
      course_title_en: iTitleEn >= 0 ? cols[iTitleEn] || undefined : undefined,
      is_completed: ["true", "1", "y", "yes", "수료", "완료"].includes(completedRaw),
      completed_at: iDate >= 0 && cols[iDate] ? cols[iDate] : null,
      source_lms: iLms >= 0 ? cols[iLms] || undefined : undefined,
      source_course_id: iSrcId >= 0 ? cols[iSrcId] || undefined : undefined,
      notes: iNotes >= 0 ? cols[iNotes] || undefined : undefined,
    });
  }
  return rows;
};

const AdminLegacyRecords = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["legacy-learning-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legacy_learning_records")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
  });

  const userIds = useMemo(() => Array.from(new Set(records.map((r: any) => r.user_id))), [records]);

  const { data: profileMap = {} } = useQuery({
    queryKey: ["legacy-record-profiles", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, department")
        .in("user_id", userIds);
      const map: Record<string, any> = {};
      (data || []).forEach((p: any) => { map[p.user_id] = p; });
      return map;
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter((r: any) => {
      const p = profileMap[r.user_id];
      return (
        r.course_title?.toLowerCase().includes(q) ||
        r.source_lms?.toLowerCase().includes(q) ||
        p?.full_name?.toLowerCase().includes(q) ||
        p?.email?.toLowerCase().includes(q)
      );
    });
  }, [records, profileMap, search]);

  const uploadMutation = useMutation({
    mutationFn: async (rows: ParsedRow[]) => {
      // Resolve emails to user_ids
      const emails = Array.from(new Set(rows.map((r) => r.email.toLowerCase()).filter(Boolean)));
      if (emails.length === 0) throw new Error("CSV에 유효한 이메일이 없습니다.");

      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, email")
        .in("email", emails);
      if (pErr) throw pErr;

      const emailToId: Record<string, string> = {};
      (profiles || []).forEach((p: any) => {
        if (p.email) emailToId[p.email.toLowerCase()] = p.user_id;
      });

      const batchId = crypto.randomUUID();
      const inserts: any[] = [];
      const skipped: string[] = [];
      for (const r of rows) {
        const uid = emailToId[r.email.toLowerCase()];
        if (!uid) { skipped.push(r.email); continue; }
        inserts.push({
          user_id: uid,
          course_title: r.course_title,
          course_title_en: r.course_title_en || null,
          is_completed: r.is_completed,
          completed_at: r.completed_at || null,
          source_lms: r.source_lms || null,
          source_course_id: r.source_course_id || null,
          notes: r.notes || null,
          uploaded_by: user?.id || null,
          upload_batch_id: batchId,
        });
      }
      if (inserts.length === 0) throw new Error(`등록된 학습자를 찾을 수 없습니다. (스킵: ${skipped.length}건)`);
      const { error } = await supabase.from("legacy_learning_records").insert(inserts);
      if (error) throw error;
      return { inserted: inserts.length, skipped };
    },
    onSuccess: ({ inserted, skipped }) => {
      toast({
        title: "업로드 완료",
        description: `${inserted}건 등록${skipped.length ? ` · 미등록 이메일 ${skipped.length}건 스킵` : ""}`,
      });
      queryClient.invalidateQueries({ queryKey: ["legacy-learning-records"] });
    },
    onError: (err: Error) => toast({ title: "업로드 실패", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("legacy_learning_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "삭제되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["legacy-learning-records"] });
    },
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const rows = parseCSV(text);
      if (rows.length === 0) throw new Error("CSV에 데이터 행이 없습니다.");
      uploadMutation.mutate(rows);
    } catch (err: any) {
      toast({ title: "CSV 파싱 오류", description: err.message, variant: "destructive" });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const downloadTemplate = () => {
    const headers = ["email", "course_title", "course_title_en", "is_completed", "completed_at", "source_lms", "source_course_id", "notes"];
    const sample = ["student@example.com", "비즈니스 영어", "Business English", "true", "2024-03-15", "기존LMS", "C-001", ""];
    const csv = "\uFEFF" + headers.join(",") + "\r\n" + sample.join(",") + "\r\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "legacy_learning_records_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2">
              <Archive className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
              이전 학습 이력
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              기존 LMS에서 이관된 수강 이력을 CSV로 일괄 업로드하고 조회합니다. (조회 전용 — 신규 통계/수료증에는 영향 없음)
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadTemplate} className="gap-1.5">
              <Download className="h-4 w-4" /> CSV 양식
            </Button>
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending} className="gap-1.5">
              <Upload className="h-4 w-4" /> {uploadMutation.isPending ? "업로드 중..." : "CSV 업로드"}
            </Button>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              전체 이력 ({filtered.length.toLocaleString()}건)
            </CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="이름·이메일·과정명·LMS 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>학습자</TableHead>
                    <TableHead>과정명</TableHead>
                    <TableHead>수료여부</TableHead>
                    <TableHead>수료일</TableHead>
                    <TableHead>출처 LMS</TableHead>
                    <TableHead>등록일</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">불러오는 중...</TableCell></TableRow>
                  )}
                  {!isLoading && filtered.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">데이터가 없습니다.</TableCell></TableRow>
                  )}
                  {filtered.map((r: any) => {
                    const p = profileMap[r.user_id];
                    return (
                      <TableRow key={r.id} className="border-b-2 border-border/80">
                        <TableCell>
                          <div className="font-medium">{p?.full_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{p?.email || r.user_id.slice(0, 8)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{r.course_title}</div>
                          {r.course_title_en && <div className="text-xs text-muted-foreground">{r.course_title_en}</div>}
                        </TableCell>
                        <TableCell>
                          {r.is_completed ? (
                            <Badge className="bg-foreground text-background hover:bg-foreground/90">수료</Badge>
                          ) : (
                            <Badge variant="outline">미수료</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{r.completed_at || "—"}</TableCell>
                        <TableCell className="text-sm">{r.source_lms || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("ko-KR")}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(r.id); }}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default AdminLegacyRecords;
