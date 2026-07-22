import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const LANGS: { code: string; label: string }[] = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "yue", label: "粵語" },
  { code: "zh-CN", label: "简体中文" },
];

const resolveCurrent = (raw?: string) => {
  if (!raw) return "ko";
  const lower = raw.toLowerCase();
  if (lower === "yue" || lower.startsWith("yue-") ||
      lower === "zh-hk" || lower === "zh-mo" ||
      lower.startsWith("zh-hant-hk") || lower.startsWith("zh-yue")) return "yue";
  if (lower.startsWith("zh")) return "zh-CN";
  if (lower.startsWith("ja")) return "ja";
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("ko")) return "ko";
  return "ko";
};

const LanguageToggle = () => {
  const { i18n } = useTranslation();
  const currentLang = resolveCurrent(i18n.language);

  const changeLang = (lang: string) => {
    // Mark as a manual choice so country-based auto-switch doesn't override on next login
    try {
      localStorage.setItem("nfl-lang-manual", "1");
      localStorage.setItem("nfl-lang-manual-at", String(Date.now()));
    } catch {}
    i18n.changeLanguage(lang);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Change language">
          <Globe className="h-[18px] w-[18px]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[120px]">
        {LANGS.map(({ code, label }) => (
          <DropdownMenuItem
            key={code}
            onClick={() => changeLang(code)}
            className={`text-xs ${currentLang === code ? "font-bold bg-accent" : ""}`}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageToggle;
