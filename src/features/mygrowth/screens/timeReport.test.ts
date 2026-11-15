import { describe, it, expect } from 'vitest';
import { formatMinutes, defaultPeriod } from './timeReport';
describe('시간 보고서', () => {
  it('분을 시간·분으로 표시합니다', () => { expect(formatMinutes(95)).toBe('1시간 35분'); expect(formatMinutes(30)).toBe('30분'); expect(formatMinutes(120)).toBe('2시간'); });
  it('기본 기간은 올해 1월 1일부터 오늘까지입니다', () => { expect(defaultPeriod(new Date(2026, 10, 15))).toEqual({ from: '2026-01-01', to: '2026-11-15' }); });
});
