import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Send, Trash2, Power, PowerOff } from "lucide-react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

const AdminPlatformUpdates = () => {
  const qc = useQueryClient();
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<"info" | "important" | "critical">("important");
  const [audience, setAudience] = useState<"all" | "admin" | "student" | "teacher">("all");
  const [requireReload, setRequireReload] = useState(true);
  const [pwaOnly, setPwaOnly] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState("24");
  const [sending, setSending] = useState(false);

  const { data: updates = [] } = useQuery({
    queryKey: ["platform-updates-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_updates").select("*")
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });

  const reset = () => {
    setVersion(""); setTitle(""); setMessage("");
    setSeverity("important"); setAudience("all");
    setRequireReload(true); setPwaOnly(false); setExpiresInHours("24");
  };

  const handleSend = async () => {
    if (!version.trim() || !title.trim() || !message.trim()) {
      toast({ title: "필수 항목을 입력하세요", description: "버전 / 제목 / 메시지는 필수입니다.", variant: "destructive" });
      return;
    }
    setSending(true);
    const expires_at = expiresInHours && Number(expiresInHours) > 0
      ? new Date(Date.now() + Number(expiresInHours) * 3600 * 1000).toISOString()
      : null;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("platform_updates").insert({
      version, title, message, severity, target_audience: audience,
      require_reload: requireReload, pwa_only: pwaOnly,
      expires_at, created_by: user?.id,
    });
    setSending(false);
    if (error) {
      toast({ title: "발송 실패", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "푸시 발송 완료", description: "모든 대상 사용자에게 즉시 배너가 노출됩니다." });
    reset();
    qc.invalidateQueries({ queryKey: ["platform-updates-admin"] });
  };

  const toggleActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from("platform_updates").update({ active: !active }).eq("id", id);
    if (error) { toast({ title: "변경 실패", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["platform-updates-admin"] });
  };

  const removeUpdate = async (id: string) => {
    if (!confirm("이 업데이트 알림을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("platform_updates").delete().eq("id", id);
    if (error) { toast({ title: "삭제 실패", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["platform-updates-admin"] });
  };

  const sevColor: Record<string, string> = {
    info: "bg-sky-600 text-white",
    important: "bg-amber-500 text-white",
    critical: "bg-red-600 text-white",
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            플랫폼 업데이트 푸시
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            새 버전 출시 시 모든 사용자에게 즉시 "새로고침" 안내 배너를 노출합니다. PWA 사용자에게도 동일하게 전파됩니다.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">새 업데이트 발송</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>버전 *</Label>
                <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="예: 2.1.0" />
              </div>
              <div>
                <Label>중요도</Label>
                <Select value={severity} onValueChange={(v: any) => setSeverity(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">정보 (파랑)</SelectItem>
                    <SelectItem value="important">중요 (주황)</SelectItem>
                    <SelectItem value="critical">긴급 (빨강, 닫기 불가)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>대상</Label>
                <Select value={audience} onValueChange={(v: any) => setAudience(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="student">학생</SelectItem>
                    <SelectItem value="teacher">강사</SelectItem>
                    <SelectItem value="admin">관리자</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>제목 *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 새 버전이 출시되었습니다" />
            </div>

            <div>
              <Label>메시지 *</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
                placeholder="예: 학습 플레이어 안정성 개선 및 신규 기능이 추가되었습니다. 새로고침 후 이용해주세요." />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">새로고침 버튼 표시</p>
                  <p className="text-[11px] text-muted-foreground">캐시·서비스워커 정리 후 강제 새로고침</p>
                </div>
                <Switch checked={requireReload} onCheckedChange={setRequireReload} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">PWA 설치자만</p>
                  <p className="text-[11px] text-muted-foreground">홈 화면에 설치한 사용자에게만 노출</p>
                </div>
                <Switch checked={pwaOnly} onCheckedChange={setPwaOnly} />
              </div>
              <div>
                <Label>자동 만료 (시간)</Label>
                <Input type="number" min="0" value={expiresInHours} onChange={(e) => setExpiresInHours(e.target.value)}
                  placeholder="0 = 만료 없음" />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSend} disabled={sending} size="lg">
                <Send className="h-4 w-4 mr-2" />
                {sending ? "발송 중..." : "즉시 발송"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">최근 발송 기록</CardTitle>
          </CardHeader>
          <CardContent>
            {updates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">발송 기록이 없습니다.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {updates.map((u: any) => (
                  <div key={u.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{u.title}</span>
                        <Badge className={`${sevColor[u.severity]} border-0 text-[10px]`}>{u.severity}</Badge>
                        <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">v{u.version}</span>
                        <span className="text-[10px] text-muted-foreground">{u.target_audience}</span>
                        {!u.active && <Badge variant="outline" className="text-[10px]">비활성</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{u.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {format(new Date(u.created_at), "yyyy-MM-dd HH:mm")}
                        {u.expires_at && <> · 만료 {format(new Date(u.expires_at), "MM-dd HH:mm")}</>}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(u.id, u.active)} title={u.active ? "비활성화" : "활성화"}>
                        {u.active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeUpdate(u.id)} title="삭제">
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminPlatformUpdates;
