import { useMemo, useState } from "react";
import { BookMarked, Search, GraduationCap, Users, ShieldCheck, ChevronRight } from "lucide-react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { useUserRole } from "@/hooks/useUserRole";

type Section = {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  tips?: string[];
};

type RoleManual = {
  role: "student" | "teacher" | "admin";
  label: string;
  icon: React.ElementType;
  intro: string;
  sections: Section[];
};

const MANUALS: RoleManual[] = [
  {
    role: "student",
    label: "학습자",
    icon: GraduationCap,
    intro:
      "강의를 신청하고, 차시 영상을 시청하며, 과제·평가를 제출하고, 수료증을 받기까지 학습자가 알아야 할 모든 흐름을 안내합니다.",
    sections: [
      {
        id: "s-login",
        title: "1. 로그인 및 첫 화면",
        summary: "계정으로 로그인하고 대시보드에서 내 학습 상태를 확인합니다.",
        steps: [
          "초기 화면에서 아이디(이메일)와 비밀번호를 입력해 로그인합니다.",
          "‘아이디 저장’을 체크하면 다음 접속 시 자동으로 입력됩니다.",
          "비밀번호를 잊은 경우 ‘비밀번호 재설정’을 눌러 이메일로 안내를 받으세요.",
          "로그인 후 대시보드에서 진행 중인 강의, 마감 임박 과제, 공지/알림을 확인합니다.",
        ],
        tips: ["모바일에서 홈 화면에 추가하면 PWA 앱처럼 사용할 수 있습니다."],
      },
      {
        id: "s-catalog",
        title: "2. 강의 둘러보기 & 신청",
        summary: "강의 목록(카탈로그)에서 듣고 싶은 강의를 신청합니다.",
        steps: [
          "좌측 메뉴에서 ‘강의 목록(Catalog)’을 클릭합니다.",
          "카테고리/검색으로 원하는 강의를 찾고 카드를 눌러 상세를 봅니다.",
          "‘수강 신청’ 버튼을 누르면 관리자 승인 절차가 진행됩니다.",
          "승인되면 ‘내 강의’ 메뉴에 강의가 자동으로 추가됩니다.",
        ],
        tips: ["필수교육(의무 수강)은 카탈로그에서 신청 없이 자동으로 배정될 수 있습니다."],
      },
      {
        id: "s-learning",
        title: "3. 강의 학습 (차시 시청)",
        summary: "1강의 안의 차시를 순서대로 학습합니다.",
        steps: [
          "‘내 강의’에서 학습할 강의를 선택합니다.",
          "차시 목록에서 학습할 차시를 클릭해 플레이어를 엽니다.",
          "영상 80% 이상 시청하면 해당 차시가 자동 완료됩니다.",
          "이전 차시를 완료해야 다음 차시가 열립니다(강의 설정에 따라 다름).",
          "수강 중에는 진도가 10초 단위로 서버에 자동 저장됩니다.",
        ],
        tips: [
          "첫 시청에서는 점프(빨리 감기)가 제한될 수 있습니다. 한 번 완료한 차시는 자유롭게 탐색 가능합니다.",
          "모바일 데이터 사용 시 Wi-Fi 환경을 권장합니다.",
        ],
      },
      {
        id: "s-assignment",
        title: "4. 과제 제출",
        summary: "텍스트와 첨부파일을 함께 제출할 수 있습니다.",
        steps: [
          "‘과제’ 메뉴 또는 강의 상세 안의 과제 탭에서 과제를 엽니다.",
          "작성란에 답변을 입력하고, 필요한 경우 파일을 첨부합니다(최대 5개, 파일당 10MB).",
          "‘제출’ 버튼을 눌러 저장합니다. 마감 전에는 다시 수정/재제출이 가능합니다.",
          "강사 또는 AI 채점 결과는 ‘과제 결과’에서 확인합니다.",
        ],
      },
      {
        id: "s-assessment",
        title: "5. 평가 응시",
        summary: "강의에 등록된 평가(퀴즈)에 응시하고 결과를 확인합니다.",
        steps: [
          "강의 상세에서 ‘평가’ 항목을 엽니다.",
          "제한 시간이 있는 경우 시작 후 일시정지 없이 진행됩니다.",
          "모든 문항에 답한 뒤 ‘제출’을 누릅니다.",
          "통과(Pass) 시 30점, 미통과/단순 완료 시 10점이 학습 포인트로 적립됩니다.",
        ],
        tips: ["응시 중 새로고침은 답안을 잃을 수 있으니 주의하세요."],
      },
      {
        id: "s-attendance",
        title: "6. 출석 체크",
        summary: "강의 접속 자체가 자동 출석으로 기록됩니다.",
        steps: [
          "강의 영상을 재생하거나 학습 페이지에 머무르는 시간이 출석으로 집계됩니다.",
          "출석 현황은 관리자/강사가 ‘출석 관리’에서 조회합니다.",
        ],
      },
      {
        id: "s-board",
        title: "7. 공지·게시판·알림",
        summary: "최근 공지와 자료실, 그리고 알림을 확인합니다.",
        steps: [
          "‘공지사항’: 새로운 글은 24시간 동안 ‘NEW’ 뱃지가 표시됩니다.",
          "‘게시판’: 자료 다운로드 및 댓글 작성이 가능합니다.",
          "상단의 종 아이콘에서 개인 알림(과제 마감, 공지 등)을 확인합니다.",
        ],
      },
      {
        id: "s-cert",
        title: "8. 수료증 발급",
        summary: "수료 조건을 충족하면 수료증이 자동 발급됩니다.",
        steps: [
          "강의의 수료 조건(진도/평가/과제)을 모두 충족합니다.",
          "‘성취/수료’ 메뉴에서 발급된 수료증을 확인합니다.",
          "수료증을 PDF/이미지로 저장하거나 인쇄할 수 있습니다.",
        ],
      },
      {
        id: "s-mypage",
        title: "9. 마이페이지 (프로필/아바타)",
        summary: "프로필 정보와 아바타를 관리합니다.",
        steps: [
          "우측 상단 프로필 또는 ‘마이페이지’ 메뉴로 이동합니다.",
          "이름, 연락처 등 기본 정보를 수정합니다.",
          "‘아바타’ 탭에서 24종 프리셋 중 선택하거나 직접 업로드할 수 있습니다.",
        ],
      },
    ],
  },
  {
    role: "teacher",
    label: "러닝 리더(강사)",
    icon: Users,
    intro:
      "강의 콘텐츠를 설계·운영하고, 학습자의 진도/과제/출석을 관리하며, 평가와 공지를 통해 학습을 이끄는 러닝 리더용 매뉴얼입니다.",
    sections: [
      {
        id: "t-course",
        title: "1. 강의 만들기 & 편집",
        summary: "강의 기본 정보부터 차시(콘텐츠)까지 구성합니다.",
        steps: [
          "좌측 ‘강의 관리’에서 ‘새 강의’를 클릭합니다.",
          "제목/설명/카테고리/썸네일을 입력합니다. (한국어/영어 탭을 각각 채워 다국어를 지원합니다)",
          "차시(콘텐츠)를 추가합니다: 영상(YouTube/Vimeo/Kollus/Bunny CDN), 망고보드(플립러닝), 미디어 패키지(이미지+영상 슬라이드) 등 유형 선택.",
          "수료 조건(진도율 %, 평가 통과, 과제 제출 여부)을 설정합니다.",
          "‘저장’ 후 ‘공개’로 전환하면 학습자가 카탈로그에서 볼 수 있습니다.",
        ],
        tips: [
          "다국어 자동 번역이 켜져 있다면 한국어 입력 후 영어 탭이 자동으로 채워집니다(수동 편집 시 자동번역은 중단됩니다).",
        ],
      },
      {
        id: "t-assignment",
        title: "2. 과제 등록 & 채점",
        summary: "과제를 등록하고 일괄 채점하거나 AI 채점을 활용합니다.",
        steps: [
          "‘과제 관리’ → ‘과제 등록’에서 제목, 마감일, 배점, 첨부 허용을 설정합니다.",
          "강의/차시와 연결하면 학습자에게 자동 노출됩니다.",
          "제출 목록에서 학습자별 답안과 첨부파일을 확인합니다.",
          "‘일괄 채점’ 또는 ‘AI 채점 워크플로우’를 통해 빠르게 점수를 부여합니다.",
          "코멘트를 함께 남기면 학습자에게 알림이 갑니다.",
        ],
      },
      {
        id: "t-assessment",
        title: "3. 평가 등록·수정·삭제",
        summary: "퀴즈 형식의 평가를 만들고 관리합니다.",
        steps: [
          "강의 상세 또는 ‘평가 관리’에서 ‘평가 추가’를 누릅니다.",
          "문항을 한 개씩 입력하거나 일괄 업로드 다이얼로그로 한 번에 등록합니다.",
          "통과 기준 점수, 제한 시간, 재응시 허용 여부를 설정합니다.",
          "기존 평가는 ‘수정’ 또는 ‘삭제’로 관리할 수 있습니다.",
        ],
        tips: ["정답은 서버에서만 채점되며 클라이언트에 노출되지 않습니다."],
      },
      {
        id: "t-students",
        title: "4. 학습자 관리 & 진도 모니터링",
        summary: "내 강의 수강생의 진도/과제/평가를 한눈에 봅니다.",
        steps: [
          "‘학습자 관리’에서 강의별 수강생 리스트를 확인합니다.",
          "학습자 이름을 클릭하면 진도율, 과제 제출, 평가 결과, 출석 현황을 상세 조회합니다.",
          "도움이 필요한 학습자에게 알림을 보내거나 메모를 남길 수 있습니다.",
        ],
      },
      {
        id: "t-attendance",
        title: "5. 출석 관리",
        summary: "내 강의의 출석 현황을 확인하고 기록을 관리합니다.",
        steps: [
          "‘출석 관리’에서 강의별·일자별 출석 표를 봅니다.",
          "필요한 경우 수동으로 출석 처리/사유 입력이 가능합니다.",
          "CSV로 내보내 별도 보고에 활용할 수 있습니다.",
        ],
      },
      {
        id: "t-comm",
        title: "6. 공지/게시판/알림",
        summary: "학습자에게 공지와 자료를 전달합니다.",
        steps: [
          "‘공지사항 관리’에서 새 공지를 작성하고, 강의/대상 그룹을 지정합니다.",
          "‘게시판 관리’에서 자료를 업로드하고 댓글을 관리합니다.",
          "‘알림 관리’에서 학습자에게 직접 알림(개인/그룹)을 발송합니다.",
        ],
      },
    ],
  },
  {
    role: "admin",
    label: "관리자",
    icon: ShieldCheck,
    intro:
      "조직·회원·강의·운영·시스템을 총괄하는 관리자용 매뉴얼입니다. 신규 운영자가 빠르게 인계받을 수 있도록 단계별로 안내합니다.",
    sections: [
      {
        id: "a-users",
        title: "1. 회원 관리",
        summary: "회원을 등록·수정하고 권한을 부여합니다.",
        steps: [
          "‘회원 관리’에서 회원 목록을 검색/필터로 조회합니다.",
          "신규 등록: ‘회원 추가’ 또는 ‘일괄 업로드(엑셀)’로 등록합니다. (엣지 함수로 이메일 인증을 자동 우회)",
          "회원 카드의 ‘편집’에서 이름, 소속(지점/팀), 역할(학습자/강사/관리자), 활성 여부를 변경합니다.",
          "비밀번호 재설정 메일은 ‘비밀번호 재설정’ 버튼으로 보냅니다.",
        ],
        tips: ["관리자 권한은 별도 user_roles 테이블에서 관리되며, 슈퍼관리자만 ‘관리자 권한’을 부여/회수할 수 있습니다."],
      },
      {
        id: "a-org",
        title: "2. 조직 관리 (본사 → 지점 → 팀)",
        summary: "조직 트리를 구성하고 지점 코드로 가입을 분류합니다.",
        steps: [
          "‘조직 관리’에서 지점/팀을 추가합니다. 지점은 고유 코드, 팀은 코드 없이 운영됩니다.",
          "회원에게 지점/팀을 배정해 분류 및 통계에 반영합니다.",
          "지점장 권한이 필요한 경우 ‘부서 관리자(Dept Admin)’로 추가 지정합니다.",
        ],
      },
      {
        id: "a-courses",
        title: "3. 강의/차시/트랙 관리",
        summary: "강의 생성·편집, 학습 트랙 묶음, 동영상/콘텐츠 자산 관리.",
        steps: [
          "‘강의 관리’: 강의를 생성하고 한국어/영어 모두 작성합니다.",
          "‘학습 트랙 관리’: 여러 강의를 묶어 트랙(커리큘럼)으로 배정합니다.",
          "‘동영상 관리’: 외부 영상(Kollus, Bunny CDN, YouTube 등) URL을 통합 관리합니다.",
          "‘영상 자동 점검 / 모바일 영상 점검’: 영상 재생 상태를 정기적으로 점검합니다.",
          "‘다국어 관리’: 번역 누락 항목을 일괄 확인/보완합니다.",
        ],
      },
      {
        id: "a-enroll",
        title: "4. 수강 신청 승인 & 학습 운영",
        summary: "신청을 승인하고 학습 진행을 관리합니다.",
        steps: [
          "‘수강 신청 관리’에서 신청 내역을 승인/반려합니다.",
          "‘학습 관리’에서 강의별·회원별 진도, 완료 여부를 확인합니다.",
          "‘수료 관리’에서 수료 조건/수료증 템플릿을 설정하고 발급 현황을 봅니다.",
          "‘설문 관리’로 강의 종료 후 설문(만족도)을 수집합니다.",
          "‘이관 학습 이력’에서 기존 시스템에서 옮겨온 데이터를 조회합니다.",
        ],
      },
      {
        id: "a-attendance",
        title: "5. 출석/통계 모니터링",
        summary: "실시간 접속자와 학습 통계를 확인합니다.",
        steps: [
          "‘통계 현황’: 동시접속자, 페이지뷰, 시간대별 접속을 봅니다(10초 배치 집계).",
          "‘글로벌 대시보드’: 지점/강의별 학습 현황을 비교합니다.",
          "‘출석 관리’: 전체 회원의 출석 데이터를 조회/내보냅니다.",
        ],
      },
      {
        id: "a-comm",
        title: "6. 커뮤니케이션 (알림/공지/게시판)",
        summary: "전사 단위로 알림과 콘텐츠를 운영합니다.",
        steps: [
          "‘알림 관리’: 대상 그룹을 지정해 푸시 알림을 전송합니다.",
          "‘공지사항 관리’: 메인에 노출되는 공지를 등록·예약합니다.",
          "‘게시판 관리’: 자료실 파일을 업로드하고 카테고리를 관리합니다.",
        ],
      },
      {
        id: "a-system",
        title: "7. 시스템 설정 / PWA / 플랫폼 업데이트",
        summary: "사이트 전반 설정과 PWA 앱, 업데이트 공지를 관리합니다.",
        steps: [
          "‘설정’: 사이트 기본 옵션, 메뉴 노출, 강사 역할 활성 여부 등을 조정합니다.",
          "‘PWA 앱 설정’: 앱 이름·짧은 이름·테마 색상·설치 안내 주기를 설정합니다(브랜드 통합 관리).",
          "‘플랫폼 업데이트 푸시’: 업데이트 공지를 작성합니다. ‘PWA 전용’으로 체크하면 설치 사용자에게만 노출됩니다.",
          "‘시스템 정보’: 기술 스택/보안 백서/PWA 상태를 확인하고 감사 자료로 활용합니다.",
        ],
      },
      {
        id: "a-security",
        title: "8. 보안 및 운영 원칙",
        summary: "데이터 보호와 권한 관리를 위한 원칙입니다.",
        steps: [
          "역할은 반드시 user_roles 테이블에서만 부여합니다(권한 상승 공격 방지).",
          "민감 작업(영상 토큰, 일괄 등록, 비밀번호 재설정)은 모두 엣지 함수에서 처리됩니다.",
          "감사 로그는 로그인/권한 변경/관리자 작업 전체에 기록됩니다.",
          "백업은 PITR 7일 + 일일 풀백업 30일 보관됩니다.",
        ],
      },
    ],
  },
];

const filterSections = (sections: Section[], q: string) => {
  if (!q.trim()) return sections;
  const k = q.toLowerCase();
  return sections.filter((s) => {
    if (s.title.toLowerCase().includes(k)) return true;
    if (s.summary.toLowerCase().includes(k)) return true;
    if (s.steps.some((line) => line.toLowerCase().includes(k))) return true;
    if (s.tips?.some((line) => line.toLowerCase().includes(k))) return true;
    return false;
  });
};

const ManualPanel = ({ manual, query }: { manual: RoleManual; query: string }) => {
  const Icon = manual.icon;
  const sections = useMemo(() => filterSections(manual.sections, query), [manual.sections, query]);
  return (
    <div className="space-y-5">
      <div className="stat-card">
        <div className="flex items-start gap-3">
          <Icon className="h-6 w-6 text-foreground mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">{manual.label} 매뉴얼</h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{manual.intro}</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="font-normal">총 {manual.sections.length}개 챕터</Badge>
              {query && (
                <Badge variant="outline" className="font-normal">‘{query}’ 검색 결과 {sections.length}건</Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {sections.length === 0 ? (
        <div className="stat-card text-center text-sm text-muted-foreground py-10">
          검색 결과가 없습니다. 다른 단어로 시도해 보세요.
        </div>
      ) : (
        <Accordion type="multiple" className="space-y-3">
          {sections.map((s) => (
            <AccordionItem
              key={s.id}
              value={s.id}
              className="stat-card !p-0 overflow-hidden border-b-0"
            >
              <AccordionTrigger className="px-5 py-4 hover:no-underline">
                <div className="flex items-start gap-3 text-left min-w-0">
                  <ChevronRight className="h-4 w-4 text-muted-foreground mt-1 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-foreground">{s.title}</div>
                    <div className="text-sm text-muted-foreground mt-1">{s.summary}</div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-5">
                <ol className="list-decimal list-inside space-y-2 text-sm text-foreground leading-relaxed pl-7">
                  {s.steps.map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ol>
                {s.tips && s.tips.length > 0 && (
                  <div className="mt-4 pl-7">
                    <div className="text-xs font-semibold text-muted-foreground mb-1">TIP</div>
                    <ul className="space-y-1">
                      {s.tips.map((tip, i) => (
                        <li key={i} className="text-sm text-muted-foreground leading-relaxed">· {tip}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
};

const UserManual = () => {
  const { primaryRole } = useUserRole();
  const [query, setQuery] = useState("");
  const defaultTab =
    primaryRole === "admin" ? "admin" : primaryRole === "teacher" ? "teacher" : "student";

  return (
    <DashboardLayout role={primaryRole}>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground flex items-center gap-2">
            <BookMarked className="h-6 w-6" aria-hidden="true" />
            사용자 매뉴얼
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            학습자 · 러닝 리더 · 관리자 업무와 학습 플로우에 맞춘 사용 안내서입니다. 키워드로 검색해 필요한 절차를 빠르게 찾아보세요.
          </p>
        </div>

        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예) 수강 신청, 영상 80%, 평가 삭제, PWA 설정..."
            className="pl-9"
          />
        </div>

        <Tabs defaultValue={defaultTab} className="space-y-4">
          <TabsList>
            {MANUALS.map((m) => {
              const Icon = m.icon;
              return (
                <TabsTrigger key={m.role} value={m.role} className="gap-2 text-sm">
                  <Icon className="h-4 w-4" />
                  {m.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {MANUALS.map((m) => (
            <TabsContent key={m.role} value={m.role}>
              <ManualPanel manual={m} query={query} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default UserManual;
