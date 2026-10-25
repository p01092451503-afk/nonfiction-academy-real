import { Smartphone, Lightbulb } from "lucide-react";
import { useTranslation } from "react-i18next";
import AppInstallCard from "@/components/AppInstallCard";

export default function StudentAppInstall() {
  const { t } = useTranslation();
  return (
    <div className="w-full min-w-0 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
          <Smartphone className="h-6 w-6" />
          {t("appInstallPage.title", "앱 설치")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("appInstallPage.subtitle", "휴대폰·PC 홈 화면에 설치해 앱처럼 바로 실행하세요.")}
        </p>
      </div>

      <div className="flex items-center gap-4 min-w-0 rounded-lg border-2 border-border/80 p-4">
        <img src="/nonfiction-pwa-icon-192-v20261025.png" alt="NONFICTION" className="h-14 w-14 rounded-xl border border-border shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">NONFICTION Academy</p>
          <p className="text-sm text-muted-foreground">{t("appInstallPage.subtitle", "휴대폰·PC 홈 화면에 설치해 앱처럼 바로 실행하세요.")}</p>
        </div>
      </div>

      <AppInstallCard />

      <div className="rounded-lg border-2 border-border/80 p-5">
        <p className="font-semibold flex items-center gap-2">
          <Lightbulb className="h-4 w-4" />
          {t("appInstallPage.tipsTitle", "이것만 알아두세요")}
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          <li>· {t("appInstallPage.tip1")}</li>
          <li>· {t("appInstallPage.tip2")}</li>
          <li>· {t("appInstallPage.tip3")}</li>
        </ul>
      </div>
    </div>
  );
}
