# 학습시간 산정 기준 변경 계획

## 변경 요약
- **현재**: 로그인 세션(user_sessions의 login_at~logout_at, 미종료 시 30분 가정) 기반
- **변경 후**: **"내 강의 → 특정 강의 클릭(CourseDetail 진입)"** 시점부터 측정, **세션당 최대 30분 캡**

## 1. 새 테이블: `course_learning_sessions`
| 컬럼 | 설명 |
|---|---|
| id | PK |
| user_id | 학습자 |
| course_id | 강의 |
| started_at | 강의 클릭 시점 (CourseDetail mount) |
| last_heartbeat_at | 마지막 활동 시각 (1분마다 갱신, started_at+30min 캡) |
| tenant_id | 테넌트 |

- RLS: 본인 INSERT/UPDATE, admin/super_admin/teacher 조회 가능
- GRANT: authenticated SELECT/INSERT/UPDATE, service_role ALL

## 2. 클라이언트 트래킹
**`src/pages/CourseDetail.tsx`** (또는 신규 훅 `useCourseLearningSession`)
- 페이지 마운트 시 세션 INSERT (`started_at = now()`)
- 1분마다 heartbeat로 `last_heartbeat_at` 업데이트 (단, `started_at + 30min` 초과 시 갱신 중단)
- 언마운트/탭종료(`visibilitychange`/`beforeunload`)에 `sendBeacon`으로 최종 heartbeat 전송

## 3. 학습시간 산정 공식
```sql
duration_min = LEAST(
  EXTRACT(EPOCH FROM (last_heartbeat_at - started_at))/60,
  30
)
```

## 4. 통계 화면 일괄 교체
다음 화면들이 `user_sessions` 기반 → `course_learning_sessions` 기반으로 전환:
- `admin_dashboard_insights` RPC (학습 건강도: week_minutes / prev_week_minutes)
- `src/pages/admin/AdminAttendance.tsx` (일일 학습시간)
- `src/pages/teacher/TeacherStudentDetail.tsx` (학습자별 학습시간)

> ※ DAU/WAU/MAU/접속 히트맵 등 "접속" 지표는 그대로 user_sessions 유지

## 5. 기존 데이터
- 과거 user_sessions 기반 통계는 시점 이전 자료로 그대로 두고, 신규 테이블은 도입 시점부터 누적

## 기술 메모
- heartbeat 30분 캡은 클라/서버 양쪽에서 강제 (클라가 중단해도 SQL에서 `LEAST(..., 30)`로 재캡)
- 같은 강의를 닫았다 다시 들어오면 **새 세션** 생성 → 30분 × 진입횟수만큼 누적 가능 (의도된 동작인지 확인 필요)

## 확인 필요 사항
1. **CourseDetail 진입만** 기준인가? `ContentPlayer`(차시 재생) 진입은 별도로 카운트하지 않는 것이 맞나요?
2. 같은 강의를 **재진입**할 때마다 새 30분 카운트를 인정하나요? (예: 하루에 강의 3번 들어가면 최대 90분)
