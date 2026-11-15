import { z } from 'zod';
export const reportRowSchema = z.object({ scope_key: z.string(), scope_label: z.string(), people: z.number(), online_minutes: z.number(), offline_minutes: z.number(), field_minutes: z.number(), manager_minutes: z.number(), manager_hidden: z.boolean() });
export type ReportLevel = 'person' | 'branch' | 'region' | 'global';
export const levelLabel: Record<ReportLevel, string> = { person: '개인', branch: '매장(지점)', region: '지역', global: '글로벌' };
export function formatMinutes(m: number) { const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}시간 ${r}분` : `${h}시간`) : `${r}분`; }
const pad = (n: number) => String(n).padStart(2, '0');
export function defaultPeriod(now: Date) { const y = now.getFullYear(), mo = now.getMonth() + 1; return { from: `${y}-01-01`, to: `${y}-${pad(mo)}-${pad(now.getDate())}` }; }
