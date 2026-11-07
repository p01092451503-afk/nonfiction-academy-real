import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyGrowthBoundary from './MyGrowthBoundary';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), user: { id: 'reviewer' } as { id: string } | null, roles: ['student'] }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: mocks.user, roles: mocks.roles, isLoading: false }) }));
vi.mock('./pages/MyGrowthScaffold', () => ({ default: () => <div data-testid="allowed" /> }));

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/my-growth']}><Routes>
    <Route path="/my-growth" element={<MyGrowthBoundary />} />
    <Route path="/student" element={<div data-testid="denied" />} />
    <Route path="/admin" element={<div data-testid="denied" />} />
    <Route path="/" element={<div data-testid="denied" />} />
  </Routes></MemoryRouter></QueryClientProvider>);
  return client;
}

describe('서버 검수 명단 접근 검증', () => {
  beforeEach(() => { mocks.rpc.mockReset(); mocks.user = { id: 'reviewer' }; mocks.roles = ['student']; });
  afterEach(cleanup);
  it('서버 확인이 참인 계정만 화면을 엽니다', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mount();
    await screen.findByTestId('allowed');
    expect(mocks.rpc).toHaveBeenCalledWith('is_mygrowth_reviewer');
  });
  it.each([false, null, 'true'])('서버의 참이 아닌 응답 %s를 차단합니다', async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null }); mount();
    await screen.findByTestId('denied'); expect(screen.queryByTestId('allowed')).toBeNull();
  });
  it('서버 오류가 있으면 기존 참 응답도 허용하지 않습니다', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: { message: '실패' } }); mount();
    await screen.findByTestId('denied');
  });
  it('예외가 발생해도 차단합니다', async () => {
    mocks.rpc.mockRejectedValue(new Error('시험 오류')); mount();
    await screen.findByTestId('denied');
  });
  it('미지정 최고관리자를 차단합니다', async () => {
    mocks.roles = ['super_admin']; mocks.rpc.mockResolvedValue({ data: false, error: null }); mount();
    await screen.findByTestId('denied');
  });
  it('비로그인 상태에서는 서버를 호출하지 않습니다', async () => {
    mocks.user = null; mount(); await screen.findByTestId('denied'); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('명단 회수 후 재검증하면 화면을 닫습니다', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValue({ data: false, error: null });
    const client = mount(); await screen.findByTestId('allowed');
    await client.invalidateQueries({ queryKey: ['mygrowth-reviewer', 'reviewer'] });
    await waitFor(() => expect(screen.queryByTestId('allowed')).toBeNull());
    await screen.findByTestId('denied');
  });
});