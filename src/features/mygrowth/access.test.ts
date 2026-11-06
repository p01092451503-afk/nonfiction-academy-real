import { describe, expect, it } from 'vitest';
import { canAccessMyGrowth, existingHome } from './access';

describe('마이그로스 접근 경계', () => {
  const approved = { enabled: true, verifiedUserId: 'reviewer', serverConfirmedReviewer: true };
  it('서버가 확인한 검수 계정만 허용합니다', () => expect(canAccessMyGrowth(approved)).toBe(true));
  it('서버 명단에 없는 계정은 관리자여도 거부합니다', () => expect(canAccessMyGrowth({ ...approved, serverConfirmedReviewer: false })).toBe(false));
  it('로그인하지 않은 요청을 거부합니다', () => expect(canAccessMyGrowth({ ...approved, verifiedUserId: null })).toBe(false));
  it('공개 중지 상태는 검수 계정도 거부합니다', () => expect(canAccessMyGrowth({ ...approved, enabled: false })).toBe(false));
  it.each([['student','/student'],['teacher','/teacher'],['admin','/admin'],['super_admin','/admin']])('%s의 기존 시작 주소를 유지합니다', (role, home) => expect(existingHome([role])).toBe(home));
});
