import { Navigate, Route, Routes } from 'react-router-dom';
import MyGrowthAssignments from './MyGrowthAssignments';
import MyGrowthRecords from './MyGrowthRecords';
import MyGrowthTraining from './MyGrowthTraining';
import MyGrowthPlans from './MyGrowthPlans';
import GrowthHome, { MonthTimeline } from '../screens/Home';
import GrowthList from '../screens/Lists';
import GrowthDetail from '../screens/Detail';
import Workspace, { StaffGuard } from '../screens/Workspace';
import AcademyReviewLayout from '../screens/AcademyReviewLayout';
import StaffDirectory, { StaffJourney, StaffRecordDetail } from '../screens/StaffJourney';
import MaterialDownload from '../screens/MaterialDownload';
import TimeReport from '../screens/TimeReport';
export default function MyGrowthScaffold() { return <AcademyReviewLayout><Routes><Route index element={<GrowthHome/>}/><Route path="timeline/:yyyymm" element={<MonthTimeline/>}/><Route path="learning" element={<GrowthList/>}/><Route path="coaching" element={<GrowthList kind="field"/>}/><Route path="manager-coaching" element={<GrowthList kind="manager"/>}/><Route path="detail/:key" element={<GrowthDetail/>}/><Route path="material-download/:ticket" element={<MaterialDownload/>}/><Route path="plans" element={<MyGrowthPlans/>}/><Route path="records" element={<MyGrowthRecords/>}/><Route path="workspace/staff" element={<StaffGuard kind="plans"><StaffDirectory/></StaffGuard>}/><Route path="workspace/staff/:employee" element={<StaffGuard kind="plans"><StaffJourney/></StaffGuard>}/><Route path="workspace/staff/:employee/detail/:training" element={<StaffGuard kind="plans"><StaffRecordDetail/></StaffGuard>}/><Route path="workspace" element={<Workspace/>}/><Route path="workspace/assignments" element={<StaffGuard kind="can_appoint"><MyGrowthAssignments/></StaffGuard>}/><Route path="workspace/training" element={<StaffGuard kind="can_educate"><MyGrowthTraining/></StaffGuard>}/><Route path="workspace/coaching" element={<StaffGuard kind="can_educate"><MyGrowthTraining coaching/></StaffGuard>}/><Route path="workspace/manager-coaching" element={<StaffGuard kind="manager"><MyGrowthTraining manager/></StaffGuard>}/><Route path="workspace/plans" element={<StaffGuard kind="plans"><MyGrowthPlans staffOnly/></StaffGuard>}/><Route path="training" element={<Navigate to="/my-growth/workspace/training" replace/>}/><Route path="assignments" element={<Navigate to="/my-growth/workspace/assignments" replace/>}/><Route path="reports" element={<TimeReport/>}/><Route path="*" element={<Navigate to="/my-growth" replace/>}/></Routes></AcademyReviewLayout>; }
