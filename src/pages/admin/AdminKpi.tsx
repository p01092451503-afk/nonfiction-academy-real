import KpiAdmin from '@/features/mygrowth/kpi/KpiAdmin';

export default function AdminKpi() {
  return <KpiAdmin guidePath="/admin/kpi/guide" valuesPath="/admin/kpi/values" audience="운영 관리자와 최고관리자만 사용할 수 있습니다." />;
}
