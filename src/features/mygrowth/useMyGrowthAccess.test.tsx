import { renderHook, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { useMyGrowthAccess } from './useMyGrowthAccess';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), user: { id: 'reviewer' } as { id: string } | null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: mocks.user, isLoading: false }) }));
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useMyGrowthAccess(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
describe('기존 화면의 성장 표시 권한', () => {
  beforeEach(() => { mocks.rpc.mockReset(); mocks.user = { id: 'reviewer' }; });
  afterEach(cleanup);
  it('서버가 확인한 계정만 기존 화면에 성장 기능을 표시합니다', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null }); const { result } = mount();
    await waitFor(() => expect(result.current.allowed).toBe(true));
  });
  it.each([false, null, 'true'])('확인되지 않은 응답 %s는 성장 표시를 허용하지 않습니다', async data => {
    mocks.rpc.mockResolvedValue({ data, error: null }); const { result } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true)); expect(result.current.allowed).toBe(false);
  });
  it('오류 응답은 성장 표시를 허용하지 않습니다', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: { message: '거부' } }); const { result } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true)); expect(result.current.allowed).toBe(false);
  });
  it('확인 중에는 이전 허용 결과를 표시하지 않습니다', async () => {
    mocks.rpc.mockImplementation(() => new Promise(() => {})); const { result } = mount();
    expect(result.current.allowed).toBe(false);
  });
  it('비로그인 계정은 확인 요청 없이 성장 표시를 차단합니다', () => {
    mocks.user = null; const { result } = mount(); expect(result.current.allowed).toBe(false); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});