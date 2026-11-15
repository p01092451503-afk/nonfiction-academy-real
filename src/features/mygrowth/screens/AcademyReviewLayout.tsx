import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Users, ClipboardCheck, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import nonfictionLogo from '@/assets/nonfiction-logo.png';
import { useCapabilities } from './data';

export default function AcademyReviewLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false); const caps = useCapabilities(); const c = caps.isError || caps.isFetching ? undefined : caps.data;
  const appointed = Boolean(c?.trainer || c?.manager); const operator = Boolean(c?.can_educate || c?.manager || c?.can_appoint);
  const links = [{ path: '/my-growth', label: '대시보드', icon: LayoutDashboard, end: true }, { path: '/my-growth/learning', label: '내 강의', icon: BookOpen, end: false }, ...(appointed ? [{ path: '/my-growth/workspace/staff', label: '직원 관리', icon: Users, end: false }] : []), ...(operator ? [{ path: '/my-growth/workspace', label: '운영', icon: ClipboardCheck, end: true }] : [])];
  return <div className="min-h-screen bg-background"><header className="flex min-w-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-4 sm:px-8"><Link to="/my-growth" aria-label="논픽션 아카데미 홈"><img src={nonfictionLogo} alt="논픽션" className="h-7 w-auto max-w-40"/></Link><div className="flex min-w-0 items-center gap-3"><span className="text-xs text-muted-foreground">검수 전용</span><Button size="icon" variant="ghost" className="md:hidden" aria-label={open ? '메뉴 닫기' : '메뉴 열기'} onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</Button></div></header>
    <div className="flex min-w-0"><aside className="hidden w-56 shrink-0 border-r border-border px-4 py-6 md:block"><p className="mb-5 text-xs text-muted-foreground">논픽션 아카데미</p><nav aria-label="아카데미 메뉴" className="space-y-2">{links.map(i => <Button key={i.path} asChild variant="ghost" className="w-full justify-start"><NavLink end={i.end} to={i.path} className={({ isActive }) => isActive ? 'bg-secondary text-primary' : 'text-muted-foreground'}><i.icon className="h-4 w-4"/>{i.label}</NavLink></Button>)}</nav></aside><main className="min-w-0 flex-1 px-4 py-6 pb-28 sm:px-8 md:pb-8">{children}</main></div>
    {open && <nav aria-label="휴대전화 전체 메뉴" className="fixed inset-x-0 top-[61px] z-50 border-b border-border bg-card p-4 md:hidden">{links.map(i => <Button asChild key={i.path} variant="ghost" className="w-full justify-start" onClick={() => setOpen(false)}><Link to={i.path}><i.icon className="h-4 w-4"/>{i.label}</Link></Button>)}</nav>}
    <nav aria-label="휴대전화 아카데미 메뉴" className="fixed inset-x-0 bottom-0 z-40 flex min-w-0 border-t border-border bg-card pb-[max(env(safe-area-inset-bottom),8px)] pt-2 md:hidden">{links.map(i => <Button asChild key={i.path} variant="ghost" className="h-14 min-w-0 flex-1 px-1"><NavLink end={i.end} to={i.path} className={({ isActive }) => `flex flex-col gap-1 ${isActive ? 'bg-secondary text-primary' : 'text-muted-foreground'}`}><i.icon className="h-5 w-5"/><span className="text-xs">{i.label}</span></NavLink></Button>)}</nav>
  </div>;
}