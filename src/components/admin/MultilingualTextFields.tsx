import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Languages } from "lucide-react";
import { translateKoTo, type TargetLang } from "@/lib/translate";
import { toast } from "sonner";

export type MlLang = "ko" | "en" | "ja" | "zh-CN" | "yue" | "yue";

export interface MultilingualValue {
  ko: { title: string; content: string };
  en: { title: string; content: string };
  ja: { title: string; content: string };
  "zh-CN": { title: string; content: string };
}

export const EMPTY_MULTILINGUAL: MultilingualValue = {
  ko: { title: "", content: "" },
  en: { title: "", content: "" },
  ja: { title: "", content: "" },
  "zh-CN": { title: "", content: "" },
};

const TARGET_LANGS: TargetLang[] = ["en", "ja", "zh-CN", "yue"];
const LANG_LABEL: Record<MlLang, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  "zh-CN": "中文",
};

interface Props {
  value: MultilingualValue;
  onChange: (v: MultilingualValue) => void;
  contentRows?: number;
  autoTranslate?: boolean;
  onAutoTranslateChange?: (v: boolean) => void;
}

const MultilingualTextFields = ({ value, onChange, contentRows = 6, autoTranslate, onAutoTranslateChange }: Props) => {
  const { t } = useTranslation();
  const [translating, setTranslating] = useState(false);
  const [internalAuto, setInternalAuto] = useState(true);
  const isControlled = autoTranslate !== undefined && !!onAutoTranslateChange;
  const auto = isControlled ? !!autoTranslate : internalAuto;
  const setAuto = (v: boolean) => {
    if (isControlled) onAutoTranslateChange!(v);
    else setInternalAuto(v);
    if (v) {
      onChange({
        ...value,
        en: { title: "", content: "" },
        ja: { title: "", content: "" },
        "zh-CN": { title: "", content: "" },
      });
    }
  };

  const updateLang = (lang: MlLang, patch: Partial<MultilingualValue["ko"]>) =>
    onChange({ ...value, [lang]: { ...value[lang], ...patch } });

  const handleAutoTranslate = async () => {
    if (!value.ko.title.trim() && !value.ko.content.trim()) {
      toast.error(t("multilingual.koEmpty", "한국어 내용을 먼저 입력하세요."));
      return;
    }
    const toastId = toast.loading(t("multilingual.translating", "자동 번역 진행 중입니다..."));
    try {
      setTranslating(true);
      const results = await Promise.all(
        TARGET_LANGS.map((lc) => translateKoTo(lc, [value.ko.title, value.ko.content]))
      );
      const next = { ...value };
      TARGET_LANGS.forEach((lc, i) => {
        const [tt, tc] = results[i];
        next[lc] = { title: tt || value[lc].title, content: tc || value[lc].content };
      });
      onChange(next);
      toast.success(t("multilingual.translatedAll", "3개 언어로 자동 번역되었습니다."), { id: toastId });
    } catch {
      toast.error(t("multilingual.translateFailed", "번역에 실패했습니다."), { id: toastId });
    } finally {
      setTranslating(false);
    }
  };

  const allLangs: MlLang[] = ["ko", "en", "ja", "zh-CN", "yue"];

  return (
    <Tabs defaultValue="ko" className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList className="h-8">
          {allLangs.map((lc) => (
            <TabsTrigger key={lc} value={lc} className="text-xs h-6" disabled={auto && lc !== "ko"}>
              {LANG_LABEL[lc]}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch checked={auto} onCheckedChange={setAuto} aria-label={t("multilingual.autoTranslate", "자동 번역")} />
            <Label className="text-xs cursor-pointer" onClick={() => setAuto(!auto)}>
              {t("multilingual.autoTranslate", "자동 번역")}
            </Label>
          </div>
          {!auto && (
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleAutoTranslate} disabled={translating}>
              <Languages className="h-3 w-3" />
              {translating ? t("common.processing") : t("multilingual.translateAll", "3개 언어 자동 번역")}
            </Button>
          )}
        </div>
      </div>

      <TabsContent value="ko" className="space-y-3 mt-3">
        <div className="space-y-1">
          <Label className="text-xs">{t("announcements.titleLabel", "제목")} (KO) *</Label>
          <Input value={value.ko.title} onChange={(e) => updateLang("ko", { title: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("announcements.content", "내용")} (KO) *</Label>
          <Textarea value={value.ko.content} onChange={(e) => updateLang("ko", { content: e.target.value })} rows={contentRows} />
        </div>
        {auto && (
          <p className="text-[11px] text-muted-foreground">
            {t("multilingual.autoTranslateHintAll", "저장 시 영어/일본어/중국어로 자동 번역됩니다.")}
          </p>
        )}
      </TabsContent>

      {!auto && (["en", "ja", "zh-CN", "yue"] as MlLang[]).map((lc) => (
        <TabsContent key={lc} value={lc} className="space-y-3 mt-3">
          <div className="space-y-1">
            <Label className="text-xs">{t("announcements.titleLabel", "제목")} ({lc.toUpperCase()})</Label>
            <Input
              value={value[lc].title}
              onChange={(e) => updateLang(lc, { title: e.target.value })}
              placeholder={t("multilingual.autoFillHint", "비워두면 한국어로 표시됩니다")}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("announcements.content", "내용")} ({lc.toUpperCase()})</Label>
            <Textarea
              value={value[lc].content}
              onChange={(e) => updateLang(lc, { content: e.target.value })}
              rows={contentRows}
              placeholder={t("multilingual.autoFillHint", "비워두면 한국어로 표시됩니다")}
            />
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
};

export const isMultilingualValid = (v: MultilingualValue) =>
  v.ko.title.trim().length > 0 && v.ko.content.trim().length > 0;

export default MultilingualTextFields;
