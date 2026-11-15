import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RoleBasedRedirect from './RoleBasedRedirect';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), user: { id: 'employee' } as { id: string } | null, role: 'student', teacherEnabled: true }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: mocks.user, isLoading: false }) }));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ primaryRole: mocks.role }) }));
vi.mock('@/hooks/useSystemSettings', () => ({ useSystemSettings: () => ({ teacherRoleEnabled: mocks.teacherEnabled, isLoading: false }) }));

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/dashboard']}><Routes>
    <Route path="/dashboard" element={<RoleBasedRedirect />} />
    {['/my-growth', '/student', '/teacher', '/admin', '/'].map(path => <Route key={path} path={path} element={<div data-testid={path} />} />)}
  </Routes></MemoryRouter></QueryClientProvider>);
}

describe('시연 계정 로그인 시작 화면', () => {
  beforeEach(() => { mocks.rpc.mockReset(); mocks.user = { id: 'employee' }; mocks.role = 'student'; mocks.teacherEnabled = true; });
  afterEach(cleanup);
  it('서버에서 확인한 직원은 성장 홈으로 이동합니다', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null }); mount();
    await screen.findByTestId('/my-growth'); expect(mocks.rpc).toHaveBeenCalledWith('is_mygrowth_reviewer');
  });
  it.each([false, null, 'true'])('검수 확인이 참이 아닌 응답 %s는 기존 학습 홈을 유지합니다', async data => {
    mocks.rpc.mockResolvedValue({ data, error: null }); mount();
    await screen.findByTestId('/student'); expect(screen.queryByTestId('/my-growth')).toBeNull();
  });
  it('응답 오류는 검수 자격을 부여하지 않습니다', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: { message: '오류' } }); mount(); await screen.findByTestId('/student');
  });
  it('요청 실패는 기존 학습 화면으로 이동합니다', async () => {
    mocks.rpc.mockRejectedValue(new Error('실패')); mount(); await screen.findByTestId('/student');
  });
  it('미지정 최고관리자는 기존 관리자 화면을 유지합니다', async () => {
    mocks.role = 'admin'; mocks.rpc.mockResolvedValue({ data: false, error: null }); mount(); await screen.findByTestId('/admin');
  });
  it('미지정 담당자는 기존 담당자 화면을 유지합니다', async () => {
    mocks.role = 'teacher'; mocks.rpc.mockResolvedValue({ data: false, error: null }); mount(); await screen.findByTestId('/teacher');
  });
  it('담당자 역할 비활성화 시 기존 학습 화면을 유지합니다', async () => {
    mocks.role = 'teacher'; mocks.teacherEnabled = false; mocks.rpc.mockResolvedValue({ data: false, error: null }); mount(); await screen.findByTestId('/student');
  });
  it('비로그인 계정은 서버 확인 없이 로그인 화면으로 이동합니다', async () => {
    mocks.user = null; mount(); await screen.findByTestId('/'); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});