# NONFICTION Academy 대시보드 변경안 분석 및 구현 방향

## 1. 문서 개요

업로드하신 PPTX는 **관리자 / 학습자 / 러닝리더(강사) 3개 화면**의 대시보드 개선 요구사항을 담고 있습니다. 현재 코드베이스에 이미 `AdminDashboard`, `TeacherDashboard`, `StudentDashboard`, `DeptAdminDashboard`가 존재하며, 이를 확장·재구성하는 형태로 반영 가능합니다.

**결론:** 기술적으로 전부 구현 가능하나, 범위가 넓고 데이터 집계 로직이 새로 필요하므로 **단계별(Phase) 배포**를 권장합니다.

---

## 2. 요구사항 분석

### 2-1. 관리자 화면 (Page 1)

| 요구사항 | 현재 상태 | 구현 난이도 |
|---|---|---|
| 필터: 년도/월/국가/매장 (중복 선택) | 없음 (전체 통계만 표시) | 중간 |
| 평균 이수 완료 강의 개수 | 없음 | 중간 |
| 평균 이수율 | `admin_dashboard_summary()`에 총합 기준 수료율만 있음 | 중간 |
| 평균 학습 시간 | 없음 | 중간 |
| 평균 댓글 개수 | 없음 | 중간 |
| 평균 포인트 | 없음 | 중간 |
| 평균 누적 학습일 | 없음 | 중간 |
| 6개 카드 클릭 시 드릴다운 (전체 학습자 세부 정보) | 없음 | 높음 |
| 기간 필터링 시 6개 항목 동기 변경 | 없음 | 중간 |
| 이번 주/지난 주 학습시간, 주간 활성 학습자, 완강률 | `TeacherDashboard`에 유사 지표 존재 | 낮음~중간 |
| 이탈 강의 TOP 5 | 없음 | 중간 |
| 접속 시간대 히트맵 | 없음 | 중간 |

### 2-2. 학습자 화면 (Page 2)

| 요구사항 | 현재 상태 | 구현 난이도 |
|---|---|---|
| 필터: 년도/월 (중복 선택) | 없음 | 낮음 |
| 이수율 (전체 과정에 대한 개인 이수율) | 이미 `avgProgress`로 표시 중 | 낮음 |

### 2-3. 러닝리더 화면 (Page 3)

| 요구사항 | 현재 상태 | 구현 난이도 |
|---|---|---|
| "강사" → "러닝 리더" 용어 변경 | `teacher.teacherDashboard` 등 번역 키 존재 | 낮음 |
| 필터: 년도/월 (중복 선택) | 없음 | 낮음 |
| 관리자와 동일 6개 평균 지표 (지점 범위) | 없음 | 중간 |
| 드릴다운 + 기간 필터 동기화 | 없음 | 높음 |
| 학습자 랭킹 (진행률/완료/포인트) | `topLearners` 유사 구현 존재 | 낮음 |
| 최근 과제 제출 전체보기 | `recentSubmissions` 이미 존재 | 낮음 |
| 관심이 필요한 학습자 (미접속) | `dormantStudents` 이미 존재 | 낮음 |

---

## 3. 현재 코드베이스 매핑

### 3-1. 데이터 소스

| 지표 | 사용 가능한 테이블/컬럼 | 비고 |
|---|---|---|
| 수강/완료 | `enrollments` (`progress`, `completed_at`, `completion_count`) | 복습 완료 누적은 `completion_count` 사용 |
| 학습 시간 | `course_learning_sessions` (`started_at`, `last_heartbeat_at`) | 세션당 30분 캡 이미 적용됨 |
| 댓글 | `course_comments` (`user_id`, `is_deleted`) | |
| 포인트 | `user_gamification` (`total_points`) | |
| 접속/활동 | `user_sessions` (`login_at`, `logout_at`) | |
| 소속/국가/매장 | `profiles.department_id` → `departments` (`country`, `code`, `name`) | `departments.country` 컬럼 존재 |

### 3-2. 기존 구현

- `AdminDashboard.tsx`: 실시간 접속자, 오늘 가입/수료, 대기 수강신청, 미채점 과제, 공지, 최근 활동 피드, `admin_dashboard_summary()` RPC
- `TeacherDashboard.tsx`: 지점 학생 수, 주간 활성, 평균 진도, 필수교육 이수율, 완강률, 평가 합격률, 휴면 학습자, 미채점 과제, 우수 학습자 TOP 5, 지점 수강 TOP 5
- `StudentDashboard.tsx`: 수강 중/완료 강의, 학습 시간, 뱃지, 누적 학습, 레벨/포인트, 내 댓글 수, 필수교육, 추천 강의

---

## 4. 구현 방향

### 4-1. 데이터 집계: RPC 중심으로 전환

현재 `admin_dashboard_summary()`는 전체 집계만 가능합니다. 필터(기간/국가/매장)와 드릴다운을 지원하려면 **파라미터 기반 RPC**를 새로 작성해야 합니다.

제안 함수:

```text
- dashboard_admin_metrics(filters JSONB) → 6개 평균 지표
- dashboard_leader_metrics(filters JSONB, department_ids UUID[]) → 러닝리더용 6개 지표
- dashboard_dropoff_courses(filters JSONB, limit INT) → 이탈 강의 TOP N
- dashboard_access_heatmap(filters JSONB) → 요일/시간대 히트맵 데이터
- dashboard_learner_ranking(filters JSONB, department_ids UUID[], limit INT) → 학습자 랭킹
- dashboard_learner_details(filters JSONB, department_ids UUID[]) → 드릴다운용 상세 목록
```

### 4-2. 필터 설계

| 필터 | 데이터 소스 | UI 컴포넌트 |
|---|---|---|
| 년도 | 고정 범위 (예: 2024~현재) | Multi-select |
| 월 | 1~12 | Multi-select |
| 국가 | `SELECT DISTINCT country FROM departments WHERE country IS NOT NULL` | Multi-select |
| 매장 | `departments` 중 최상위 또는 지정된 branch | Multi-select (계층 트리 권장) |

필터 상태는 URL query string으로 관리하면 뒤로가기/공유에 유리합니다.

### 4-3. UI/UX 변경

- **관리자 대시보드**: 상단 필터 바 → 6개 평균 카드(2x3) → 주간 요약(4열) → 이탈 TOP 5 + 히트맵(2열)
- **러닝리더 대시보드**: 헤더 용어 변경, 상단 필터 바 → 6개 평균 카드 → 랭킹/강의별 진도/최근 과제/관심 학습자
- **학습자 대시보드**: 상단 필터 바 → 이수율 카드 강조 → 기존 통계 카드 유지

### 4-4. "평균 누적 학습일" 정의 필요

문서에 질문으로 남겨두신 부분입니다. 구현 전에 아래 중 하나로 확정해야 합니다.

| 옵션 | 정의 | 장점 | 단점 |
|---|---|---|---|
| A | 로그인/출석일 기준 (`user_sessions` login_at 날짜의 distinct count) | 단순, 집계 빠름 | "학습"과 무관하게 카운트될 수 있음 |
| B | 실제 학습 세션 발생일 기준 (`course_learning_sessions` started_at 날짜의 distinct count) | 실제 학습과 연결 | 세션 30분 캡과 별개로 일수 집계 |
| C | 학습 완료/진행이 있었던 날짜 기준 (`content_progress`/`enrollments` 업데이트일 distinct count) | 가장 의미 있음 | 집계 로직 복잡 |

**권장:** 옵션 B 또는 C. 학습 플랫폼 특성상 "학습 활동이 있었던 날"이 가장 적절합니다.

---

## 5. 예상 개발 공수 (일정)

| Phase | 내용 | 예상 공수 | 배포 시점 |
|---|---|---|---|
| 1 | DB 함수 설계, 필터 컴포넌트, 공통 집계 유틸 | 2~3일 | 1차 |
| 2 | 관리자 대시보드: 6지표 + 드릴다운 + 주간/이탈/히트맵 | 4~5일 | 2차 |
| 3 | 러닝리더 대시보드: 용어 변경 + 지점 범위 지표 + 랭킹/과제/휴면 | 2~3일 | 3차 |
| 4 | 학습자 대시보드: 년/월 필터 + 이수율 강조 | 1~2일 | 4차 |
| 5 | 다국어, 반응형, 성능 최적화, QA | 2~3일 | 최종 |
| **합계** | | **11~16일** | |

> 공수는 기존 데이터 품질(특히 `departments.country` 채워짐 여부, `user_sessions` 로그 보관 기간)에 따라 변동될 수 있습니다.

---

## 6. 리스크 및 고려사항

1. **성능**: 전체 사용자 기준 평균 집계는 `user_sessions`, `course_learning_sessions` 같은 대용량 테이블을 스캔할 수 있습니다. 인덱스 추가와 RPC `STABLE`/`SECURITY DEFINER` 설정이 필요합니다.
2. **데이터 정의**: "누적 학습일" 기준을 확정해야 지표가 의미를 가집니다.
3. **국가/매장 데이터**: `departments.country`가 모든 지점에 채워져 있어야 필터가 정확히 작동합니다.
4. **드릴다운 권한**: 관리자는 전체, 러닝리더는 소속 지점 내 학습자만 볼 수 있도록 RLS/RPC 파라미터로 제한해야 합니다.
5. **다국어**: 신규 지표/필터 라벨은 `ko/en/ja/zh-CN/yue` 5개 언어로 추가해야 합니다.

---

## 7. 권장 진행 순서

```text
1단계: 핵심 질문 확정
  └─ "누적 학습일" 기준 확정
  └─ "매장" = 최상위 departments(branch)로 정의 확정
  └─ "이탈 강의" 정의: 수강 중이나 완료하지 않은 인원 많은 강의?

2단계: 데이터 기반 설계
  └─ RPC 함수 명세/인덱스 설계
  └─ 샘플 데이터로 지표 검증

3단계: 관리자 대시보드 먼저 구현
  └─ 필터 + 6지표 + 드릴다운

4단계: 러닝리더/학습자 대시보드 순차 적용

5단계: 다국어 + QA 후 배포
```

---

## 8. 결론 및 다음 단계

문서의 변경안은 **현재 아키텍처로 모두 구현 가능**합니다. 다만 범위가 넓고 데이터 집계가 핵심이므로, 위 5단계로 나누어 단계별 배포하는 것을 권장합니다.

**다음에 결정이 필요한 사항:**
1. "평균 누적 학습일"은 어떤 기준으로 계산할까요? (로그인일 / 학습세션일 / 학습완료일)
2. "매장" 필터는 `departments`의 최상위 branch로 볼까요, 아니면 팀(하위 department)까지 포함할까요?
3. "이탈 강의 TOP 5"는 미완료 인원 기준으로 정렬할까요, 아니면 완료율이 낮은 순으로 정렬할까요?
4. 3개 화면을 한 번에 배포할까요, 아니면 관리자 화면부터 단계별로 배포할까요?

이 4가지를 확인하면 바로 Phase 1 구현을 시작할 수 있습니다.