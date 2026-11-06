import { describe, expect, it } from 'vitest';
import { canAccessMyGrowth, existingHome, isMyGrowthReviewer, MY_GROWTH_ENABLED } from './access';

describe('마이그로스 격리 경계', () => {
  const approved = { enabled: true, isolated: true, verifiedUserId: 'reviewer', approvedReviewerIds: ['reviewer'] };
  it('공개 기본값은 꺼짐입니다', () => expect(MY_GROWTH_ENABLED).toBe(false));
  it('검증되지 않은 환경은 허용 계정도 거부합니다', () => expect(canAccessMyGrowth({ ...approved, isolated: false })).toBe(false));
  it('허용 명단에 없는 계정은 거부합니다', () => expect(canAccessMyGrowth({ ...approved, verifiedUserId: 'other' })).toBe(false));
  it('로그인하지 않은 요청을 거부합니다', () => expect(canAccessMyGrowth({ ...approved, verifiedUserId: null })).toBe(false));
  it('공개 중지 상태는 허용 계정도 거부합니다', () => expect(canAccessMyGrowth({ ...approved, enabled: false })).toBe(false));
  it('모든 조건을 만족한 명시적 허용 계정만 판정합니다', () => expect(canAccessMyGrowth(approved)).toBe(true));
  it('현재 경계는 최고관리자도 허용하지 않습니다', () => expect(isMyGrowthReviewer('00000000-0000-4000-8000-000000000001')).toBe(false));
  it.each([['student','/student'],['teacher','/teacher'],['admin','/admin'],['super_admin','/admin']])('%s의 기존 시작 주소를 유지합니다', (role, home) => expect(existingHome([role])).toBe(home));
});