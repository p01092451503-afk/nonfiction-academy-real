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
  { code: "zh-CN", label: "简体中文" },
];

const resolveCurrent = (raw?: string) => {
  if (!raw) return "ko";
  if (raw.startsWith("zh")) return "zh-CN";
  if (raw.startsWith("ja")) return "ja";
  if (raw.startsWith("en")) return "en";
  if (raw.startsWith("ko")) return "ko";
  return "ko";
};

const LanguageToggle = () => {
  const { i18n } = useTranslation();
  const currentLang = resolveCurrent(i18n.language);

  const changeLang = (lang: string) => {
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
