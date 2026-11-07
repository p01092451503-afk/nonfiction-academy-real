import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserProvider, useUser } from './UserContext';

const mocks = vi.hoisted(() => ({ listener: undefined as undefined | ((event: string, session: unknown) => void), resolveRoles: undefined as undefined | ((value: unknown) => void) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { onAuthStateChange: (fn: typeof mocks.listener) => { mocks.listener = fn; return { data: { subscription: { unsubscribe: vi.fn() } } }; } },
  from: (table: string) => {
    const chain = { insert: () => chain, select: () => chain, eq: () => table === 'user_roles'
      ? new Promise(resolve => { mocks.resolveRoles = resolve; }) : chain,
      single: async () => ({ data: table === 'profiles' ? { user_id: 'admin-user', department_id: null } : null }) };
    return chain;
  },
} }));

function Probe() { const { isLoading, roles } = useUser(); return <div data-testid="state">{isLoading ? 'pending' : roles.join(',') || 'empty'}</div>; }
afterEach(cleanup);
describe('인증 후 역할 준비 상태', () => {
  it('새 로그인은 역할 조회가 끝날 때까지 대기하며 갱신은 화면을 유지합니다', async () => {
    render(<UserProvider><Probe /></UserProvider>);
    await act(async () => { mocks.listener?.('INITIAL_SESSION', null); });
    expect(screen.getByTestId('state').textContent).toBe('empty');
    await act(async () => { mocks.listener?.('SIGNED_IN', { user: { id: 'admin-user' } }); });
    expect(screen.getByTestId('state').textContent).toBe('pending');
    await act(async () => { mocks.resolveRoles?.({ data: [{ role: 'admin' }] }); });
    expect(screen.getByTestId('state').textContent).toBe('admin');
    await act(async () => { mocks.listener?.('TOKEN_REFRESHED', { user: { id: 'admin-user' } }); });
    expect(screen.getByTestId('state').textContent).toBe('admin');
    await act(async () => { mocks.resolveRoles?.({ data: [{ role: 'admin' }] }); });
  });
  it('로그아웃 뒤 이전 역할 응답이 도착해도 역할을 복구하지 않습니다', async () => {
    render(<UserProvider><Probe /></UserProvider>);
    await act(async () => { mocks.listener?.('SIGNED_IN', { user: { id: 'admin-user' } }); });
    await act(async () => { mocks.listener?.('SIGNED_OUT', null); });
    await act(async () => { mocks.resolveRoles?.({ data: [{ role: 'admin' }] }); });
    expect(screen.getByTestId('state').textContent).toBe('empty');
  });
});