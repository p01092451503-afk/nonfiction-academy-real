import { Navigate, Route, Routes } from 'react-router-dom';
import MyGrowthAssignments from './MyGrowthAssignments';
import MyGrowthRecords from './MyGrowthRecords';
import MyGrowthTraining from './MyGrowthTraining';
import MyGrowthPlans from './MyGrowthPlans';
import { MonthTimeline } from '../screens/Home';
import GrowthList from '../screens/Lists';
import GrowthDetail from '../screens/Detail';
import Workspace, { StaffGuard } from '../screens/Workspace';
import StaffDirectory, { StaffJourney, StaffRecordDetail } from '../screens/StaffJourney';
import MaterialDownload from '../screens/MaterialDownload';
import TimeReport from '../screens/TimeReport';
import TeamGrowth from '../screens/TeamGrowth';
import KpiAdmin from '../kpi/KpiAdmin';
import KpiGuide from '../kpi/KpiGuide';
import KpiValues from '../kpi/KpiValues';
export default function MyGrowthScaffold() { return <Routes><Route index element={<Navigate to="/student" replace/>}/><Route path="timeline/:yyyymm" element={<MonthTimeline/>}/><Route path="learning" element={<Navigate to="/dashboard/courses" replace/>}/><Route path="coaching" element={<GrowthList kind="field"/>}/><Route path="manager-coaching" element={<GrowthList kind="manager"/>}/><Route path="detail/:key" element={<GrowthDetail/>}/><Route path="material-download/:ticket" element={<MaterialDownload/>}/><Route path="plans" element={<MyGrowthPlans/>}/><Route path="records" element={<MyGrowthRecords/>}/><Route path="workspace/staff" element={<StaffGuard kind="staff"><StaffDirectory/></StaffGuard>}/><Route path="workspace/staff/:employee" element={<StaffGuard kind="staff"><StaffJourney/></StaffGuard>}/><Route path="workspace/staff/:employee/detail/:training" element={<StaffGuard kind="staff"><StaffRecordDetail/></StaffGuard>}/><Route path="workspace/team" element={<StaffGuard kind="team"><TeamGrowth/></StaffGuard>}/><Route path="workspace" element={<Workspace/>}/><Route path="workspace/assignments" element={<StaffGuard kind="can_appoint"><MyGrowthAssignments/></StaffGuard>}/><Route path="workspace/training" element={<StaffGuard kind="can_educate"><MyGrowthTraining/></StaffGuard>}/><Route path="workspace/coaching" element={<StaffGuard kind="can_educate"><MyGrowthTraining coaching/></StaffGuard>}/><Route path="workspace/manager-coaching" element={<StaffGuard kind="manager"><MyGrowthTraining manager/></StaffGuard>}/><Route path="workspace/plans" element={<StaffGuard kind="plans"><MyGrowthPlans staffOnly/></StaffGuard>}/><Route path="training" element={<Navigate to="/my-growth/workspace/training" replace/>}/><Route path="assignments" element={<Navigate to="/my-growth/workspace/assignments" replace/>}/><Route path="reports" element={<TimeReport/>}/><Route path="kpi" element={<KpiValues/>}/><Route path="workspace/kpi-values" element={<KpiValues/>}/><Route path="workspace/kpi" element={<StaffGuard kind="can_appoint"><KpiAdmin/></StaffGuard>}/><Route path="workspace/kpi/guide" element={<StaffGuard kind="can_appoint"><KpiGuide/></StaffGuard>}/><Route path="*" element={<Navigate to="/student" replace/>}/></Routes>; }
