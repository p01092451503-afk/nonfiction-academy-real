import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), download: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: { id: '검수 직원' } }) }));
vi.mock('./data', () => ({ useCapabilities: () => ({ data: {} }) }));
vi.mock('./reportExport', async importOriginal => ({ ...await importOriginal<typeof import('./reportExport')>(), downloadReport: mocks.download }));
import TimeReport from './TimeReport';
import i18n from '@/i18n';
const row = { scope_key: '직원', scope_label: '검수 직원', people: 1, online_minutes: 52, offline_minutes: 115, field_minutes: 25, manager_minutes: 30, manager_hidden: false };
function mount() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TooltipProvider><TimeReport/></TooltipProvider></QueryClientProvider>);
}
async function ready() {
  await waitFor(() => expect(screen.getByRole('button', { name: '보고서 내려받기' })).not.toBeDisabled());
  return screen.getByRole('button', { name: '보고서 내려받기' });
}
beforeEach(async () => { await i18n.changeLanguage('ko'); mocks.rpc.mockReset(); mocks.download.mockReset(); mocks.rpc.mockResolvedValue({ data: [row], error: null }); });
describe('보고서 파일 생성 제어', () => {
  it('화면 언어를 바꿔도 한국어 파일과 같은 조회 범위를 유지합니다', async () => {
    await i18n.changeLanguage('ja'); mount();
    const button = await screen.findByRole('button', { name: i18n.t('mg.exportReport') });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    await waitFor(() => expect(mocks.download).toHaveBeenCalledOnce());
    expect(mocks.download.mock.calls[0][0]).toContain('"52분"');
    expect(mocks.download.mock.calls[0][0]).toContain('"1시간 55분"');
    expect(mocks.rpc.mock.calls[1]).toEqual(mocks.rpc.mock.calls[0]);
  });
  it('화면의 이전 값이 아닌 새 서버 값으로 한 번만 내려받습니다', async () => {
    mount(); const button = await ready();
    let resolve: (value: unknown) => void = () => {};
    mocks.rpc.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    fireEvent.click(button); fireEvent.click(button);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    resolve({ data: [{ ...row, online_minutes: 9 }], error: null });
    await waitFor(() => expect(mocks.download).toHaveBeenCalledOnce());
    expect(mocks.download.mock.calls[0][0]).toContain('"9분"');
  });
  it('조회 중에는 파일 생성 요청을 받지 않습니다', () => {
    mocks.rpc.mockImplementation(() => new Promise(() => {})); mount();
    fireEvent.click(screen.getByRole('button', { name: '보고서 내려받기' }));
    expect(mocks.rpc).toHaveBeenCalledOnce(); expect(mocks.download).not.toHaveBeenCalled();
  });
  it('빈 조회 결과에서는 파일을 생성하지 않습니다', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null }); mount();
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: '보고서 내려받기' })).toBeDisabled(); expect(mocks.download).not.toHaveBeenCalled();
  });
  it('다시 조회할 때 권한 오류가 나면 파일을 생성하지 않습니다', async () => {
    mount(); const button = await ready(); mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    fireEvent.click(button); await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument()); expect(mocks.download).not.toHaveBeenCalled();
  });
  it('내려받기 조회 중 기간을 바꾸면 이전 기간의 파일을 생성하지 않습니다', async () => {
    mount(); const button = await ready(); let resolve: (value: unknown) => void = () => {};
    mocks.rpc.mockImplementationOnce(() => new Promise(r => { resolve = r; })); fireEvent.click(button);
    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-02-01' } });
    resolve({ data: [row], error: null });
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(3)); expect(mocks.download).not.toHaveBeenCalled();
  });
});