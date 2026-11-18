import { describe, it, expect } from 'vitest';
import { canOpenStaff } from './data';

describe('본사 교육팀 직원 상세 공개', () => {
  it('공개 설정이 꺼진 본사 교육팀은 직원 상세를 열 수 없습니다', () => {
    expect(canOpenStaff({ trainer: false, manager: false, hq_staff: false })).toBe(false);
  });
  it('공개 설정이 켜진 본사 교육팀은 직원 상세를 열 수 있습니다', () => {
    expect(canOpenStaff({ trainer: false, manager: false, hq_staff: true })).toBe(true);
  });
  it('지정된 지점 담당자는 설정과 관계없이 직원 상세를 엽니다', () => {
    expect(canOpenStaff({ manager: true })).toBe(true);
  });
  it('권한 정보를 못 받으면 열지 않습니다', () => {
    expect(canOpenStaff(undefined)).toBe(false);
  });
});
