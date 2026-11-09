import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Smartphone, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const AdminPWASettings = () => {
  const qc = useQueryClient();
  const [failedIcons, setFailedIcons] = useState<string[]>([]);
  const installManifest = useQuery({
    queryKey: ["pwa-install-manifest"],
    queryFn: async () => {
      const response = await fetch("/manifest.webmanifest", { cache: "no-cache" });
      if (!response.ok) throw new Error("설치 아이콘 정보를 불러오지 못했습니다.");
      const manifest: { icons?: { src: string; sizes: string; purpose?: string }[] } = await response.json();
      return (manifest.icons ?? []).filter((icon) =>
        icon.purpose === "maskable" || icon.sizes === "512x512"
      );
    },
  });
  const [form, setForm] = useState({
    id: "" as string,
    app_name: "",
    short_name: "",
    description: "",
    theme_color: "#1a1a2e",
    background_color: "#ffffff",
    install_prompt_enabled: true,
    install_prompt_interval_days: 7,
  });

  const { data } = useQuery({
    queryKey: ["pwa-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pwa_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (data) setForm({ ...form, ...data });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        app_name: form.app_name,
        short_name: form.short_name,
        description: form.description,
        theme_color: form.theme_color,
        background_color: form.background_color,
        install_prompt_enabled: form.install_prompt_enabled,
        install_prompt_interval_days: Number(form.install_prompt_interval_days) || 7,
      };
      const { error } = await supabase.from("pwa_settings").update(payload).eq("id", form.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "저장 완료", description: "PWA 설정이 업데이트되었습니다. 신규 설치부터 적용됩니다." });
      qc.invalidateQueries({ queryKey: ["pwa-settings"] });
    },
    onError: (e: any) => toast({ title: "저장 실패", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            PWA 브랜드 설정
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            앱 이름·테마 색상·설치 안내 노출 주기를 관리합니다. 변경 사항은 신규 설치부터 적용됩니다 (기존 설치 사용자는 재설치 필요).
          </p>
        </div>

        <section aria-labelledby="install-icon-heading" className="border-b-2 border-border/80 pb-6">
          <h2 id="install-icon-heading" className="text-base font-semibold mb-4">현재 설치 아이콘</h2>
          {installManifest.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">아이콘을 불러오는 중입니다.</p>
          ) : installManifest.isError || !installManifest.data?.length ? (
            <p role="alert" className="text-sm text-destructive">설치 아이콘을 불러오지 못했습니다.</p>
          ) : (
            <div className="flex flex-wrap gap-6 min-w-0">
              {installManifest.data.map((icon) => (
                <figure key={icon.src} className="min-w-0 space-y-2">
                  {failedIcons.includes(icon.src) ? (
                    <div role="alert" className="w-32 h-32 flex items-center justify-center border border-border rounded-md text-sm text-destructive text-center p-3">이미지를 불러오지 못했습니다.</div>
                  ) : (
                    <img
                      src={icon.src}
                      alt={icon.purpose === "maskable" ? "논픽션 설치 아이콘 · 기기 모양 대응용" : "논픽션 설치 아이콘 · 기본형"}
                      width={128}
                      height={128}
                      className="w-32 h-32 object-contain border border-border rounded-md"
                      onError={() => setFailedIcons((previous) => previous.includes(icon.src) ? previous : [...previous, icon.src])}
                    />
                  )}
                  <figcaption className="text-sm font-medium">
                    {icon.purpose === "maskable" ? "기기 모양 대응용" : "기본형"}
                    <span className="block text-xs text-muted-foreground font-normal">{icon.sizes.replace("x", " × ")}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>

        <Card>
          <CardHeader><CardTitle className="text-base">앱 이름 및 표시</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>앱 이름 *</Label>
                <Input value={form.app_name} onChange={(e) => setForm({ ...form, app_name: e.target.value })} placeholder="NONFICTION Academy" />
                <p className="text-[11px] text-muted-foreground mt-1">설치 시 홈 화면·앱 목록에 표시</p>
              </div>
              <div>
                <Label>짧은 이름 (홈 화면) *</Label>
                <Input value={form.short_name} onChange={(e) => setForm({ ...form, short_name: e.target.value })} placeholder="NONFICTION" maxLength={12} />
                <p className="text-[11px] text-muted-foreground mt-1">최대 12자 권장</p>
              </div>
            </div>
            <div>
              <Label>설명</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>테마 색상</Label>
                <div className="flex gap-2">
                  <Input type="color" value={form.theme_color} onChange={(e) => setForm({ ...form, theme_color: e.target.value })} className="w-14 h-10 p-1" />
                  <Input value={form.theme_color} onChange={(e) => setForm({ ...form, theme_color: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>배경 색상</Label>
                <div className="flex gap-2">
                  <Input type="color" value={form.background_color} onChange={(e) => setForm({ ...form, background_color: e.target.value })} className="w-14 h-10 p-1" />
                  <Input value={form.background_color} onChange={(e) => setForm({ ...form, background_color: e.target.value })} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">설치 안내 배너</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">설치 안내 노출</p>
                <p className="text-[11px] text-muted-foreground">미설치 사용자에게 자동으로 설치 배너를 띄웁니다</p>
              </div>
              <Switch checked={form.install_prompt_enabled} onCheckedChange={(v) => setForm({ ...form, install_prompt_enabled: v })} />
            </div>
            <div>
              <Label>재노출 주기 (일)</Label>
              <Input
                type="number" min="0" max="365"
                value={form.install_prompt_interval_days}
                onChange={(e) => setForm({ ...form, install_prompt_interval_days: Number(e.target.value) })}
              />
              <p className="text-[11px] text-muted-foreground mt-1">"나중에"를 누른 사용자에게 며칠 후 다시 노출할지 (0 = 매번)</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button size="lg" onClick={() => save.mutate()} disabled={save.isPending || !form.id}>
            <Save className="h-4 w-4 mr-2" />
            {save.isPending ? "저장 중..." : "저장"}
          </Button>
        </div>
      </div>
    </>
  );
};

export default AdminPWASettings;
