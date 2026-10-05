import { Info } from "lucide-react";
import SystemInfoSection from "@/components/admin/SystemInfoSection";
import { useTranslation } from "react-i18next";

const AdminSystemInfo = () => {
  const { t } = useTranslation();
  return (
    <>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Info className="h-6 w-6" aria-hidden="true" />
            {t("admin.systemInfo", "시스템 정보")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("admin.systemInfoDesc", "플랫폼의 기술 구성과 보안 정책을 상세히 확인할 수 있습니다.")}
          </p>
        </div>
        <SystemInfoSection />
      </div>
    </>
  );
};

export default AdminSystemInfo;
