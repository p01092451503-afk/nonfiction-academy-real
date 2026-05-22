import { useMemo, useState } from "react";
import { BookMarked, Search, GraduationCap, Users, ShieldCheck, ChevronRight, Download, Languages } from "lucide-react";
import DashboardLayout from "@/components/layouts/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUserRole } from "@/hooks/useUserRole";

type Section = {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  tips?: string[];
};

type Lang = "ko" | "en" | "ja";

type LocalizedManual = {
  label: string;
  intro: string;
  sections: Section[];
};

type RoleManual = {
  role: "student" | "teacher" | "admin";
  icon: React.ElementType;
  // ko is always required and used for in-app display
  i18n: Partial<Record<Lang, LocalizedManual>>;
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const PDF_STRINGS: Record<Lang, { brand: string; manualSuffix: string; issued: string; chapters: string; footer: string; tip: string; locale: string; htmlLang: string }> = {
  ko: {
    brand: "NONFICTION ACADEMY · 사용자 매뉴얼",
    manualSuffix: "매뉴얼",
    issued: "발행일",
    chapters: "총 {n}개 챕터",
    footer: "© NONFICTION Academy — 본 문서는 시스템에서 자동 생성되었습니다.",
    tip: "TIP",
    locale: "ko-KR",
    htmlLang: "ko",
  },
  en: {
    brand: "NONFICTION ACADEMY · USER MANUAL",
    manualSuffix: "Manual",
    issued: "Issued",
    chapters: "{n} chapters",
    footer: "© NONFICTION Academy — This document was generated automatically by the system.",
    tip: "TIP",
    locale: "en-US",
    htmlLang: "en",
  },
  ja: {
    brand: "NONFICTION ACADEMY · ユーザーマニュアル",
    manualSuffix: "マニュアル",
    issued: "発行日",
    chapters: "全 {n} 章",
    footer: "© NONFICTION Academy — 本書はシステムにより自動生成されました。",
    tip: "ヒント",
    locale: "ja-JP",
    htmlLang: "ja",
  },
};

const downloadManualPdf = async (loc: LocalizedManual, lang: Lang) => {
  const S = PDF_STRINGS[lang];
  const today = new Date().toLocaleDateString(S.locale);
  const sectionsHtml = loc.sections
    .map(
      (s) => `
        <section class="chap">
          <h2>${escapeHtml(s.title)}</h2>
          <p class="summary">${escapeHtml(s.summary)}</p>
          <ol>
            ${s.steps.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
          </ol>
          ${
            s.tips && s.tips.length > 0
              ? `<div class="tips"><div class="tips-label">${S.tip}</div><ul>${s.tips
                  .map((t) => `<li>${escapeHtml(t)}</li>`)
                  .join("")}</ul></div>`
              : ""
          }
        </section>`,
    )
    .join("");

  // A4 폭(210mm)을 픽셀로 환산: 96dpi 기준 약 794px. 좌우 여백 32px 고려.
  const A4_WIDTH_PX = 794;
  const CONTENT_WIDTH_PX = A4_WIDTH_PX - 64;

  const container = document.createElement("div");
  container.style.cssText = `
    position: fixed; left: -10000px; top: 0;
    width: ${A4_WIDTH_PX}px; padding: 48px 32px; background: #ffffff;
    font-family: "Noto Sans KR", "Noto Sans JP", "Apple SD Gothic Neo", "Hiragino Sans", "Malgun Gothic", "Yu Gothic", sans-serif;
    color: #1a1a1a; line-height: 1.7; font-size: 14px;
    z-index: -1;
  `;
  container.innerHTML = `
    <style>
      .pdf-root { width: ${CONTENT_WIDTH_PX}px; }
      .pdf-root header { border-bottom: 2px solid #1a1a1a; padding-bottom: 14px; margin-bottom: 22px; }
      .pdf-root .brand { font-size: 12px; color: #666; letter-spacing: 0.08em; }
      .pdf-root h1 { font-size: 28px; margin: 8px 0 4px; font-weight: 700; }
      .pdf-root .meta { font-size: 12px; color: #666; }
      .pdf-root .intro { background: #f6f6f6; padding: 16px 18px; border-radius: 6px; margin: 18px 0 24px; font-size: 13px; color: #333; }
      .pdf-root .chap { margin-bottom: 24px; padding-bottom: 18px; border-bottom: 1px solid #e5e5e5; }
      .pdf-root .chap h2 { font-size: 18px; margin: 0 0 6px; color: #1a1a1a; font-weight: 700; }
      .pdf-root .summary { color: #555; margin: 0 0 12px; font-size: 13px; }
      .pdf-root ol { margin: 0 0 0 22px; padding: 0; }
      .pdf-root ol li { margin: 6px 0; font-size: 13px; }
      .pdf-root .tips { margin-top: 14px; background: #fff8e6; border-left: 3px solid #d4a017; padding: 10px 14px; border-radius: 4px; }
      .pdf-root .tips-label { font-size: 11px; font-weight: 700; color: #8a6d10; margin-bottom: 4px; letter-spacing: 0.05em; }
      .pdf-root .tips ul { margin: 0 0 0 18px; padding: 0; }
      .pdf-root .tips li { font-size: 12px; color: #555; margin: 3px 0; }
      .pdf-root footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e5e5e5; font-size: 11px; color: #888; text-align: center; }
    </style>
    <div class="pdf-root">
      <header>
        <div class="brand">${S.brand}</div>
        <h1>${escapeHtml(loc.label)} ${S.manualSuffix}</h1>
        <div class="meta">${S.issued} ${today} · ${S.chapters.replace("{n}", String(loc.sections.length))}</div>
      </header>
      <div class="intro">${escapeHtml(loc.intro)}</div>
      ${sectionsHtml}
      <footer>${S.footer}</footer>
    </div>
  `;
  document.body.appendChild(container);

  try {
    // 동적 import로 초기 번들 가볍게
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    // 웹폰트 로딩 대기 (한국어/일본어 문자 깨짐 방지)
    if ((document as any).fonts && (document as any).fonts.ready) {
      try { await (document as any).fonts.ready; } catch {}
    }

    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: A4_WIDTH_PX,
    });

    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pageWidthMm = 210;
    const pageHeightMm = 297;
    const imgWidthMm = pageWidthMm;
    const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;

    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    let remaining = imgHeightMm;
    let position = 0;
    pdf.addImage(imgData, "JPEG", 0, position, imgWidthMm, imgHeightMm);
    remaining -= pageHeightMm;
    while (remaining > 0) {
      position -= pageHeightMm;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgWidthMm, imgHeightMm);
      remaining -= pageHeightMm;
    }

    const safeName = loc.label.replace(/[^\p{L}\p{N}]+/gu, "_");
    pdf.save(`NONFICTION_Academy_${safeName}_${lang}.pdf`);
  } catch (e) {
    console.error("PDF generation failed", e);
    alert("PDF 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  } finally {
    if (container.parentNode) container.parentNode.removeChild(container);
  }
};


// ===== 학습자 매뉴얼 (한/영/일) — 매우 자세한 텍스트 기반 =====

const STUDENT_KO: LocalizedManual = {
  label: "학습자",
  intro:
    "NONFICTION Academy 학습자 매뉴얼입니다. 처음 접속해 보는 분도 따라 할 수 있도록, 로그인부터 강의 신청, 차시 시청, 과제·평가 제출, 수료증 받기, 모바일 앱(PWA) 설치까지 차근차근 안내합니다. 모르는 용어가 나오면 각 챕터의 ‘쉽게 말하면’ 설명과 TIP을 참고하세요.",
  sections: [
    {
      id: "s-overview",
      title: "0. 시작하기 전에 — 화면 구성 한눈에 보기",
      summary: "왼쪽은 메뉴, 가운데는 내용, 오른쪽 상단은 내 정보와 알림입니다.",
      steps: [
        "왼쪽 사이드바: ‘대시보드 / 강의 목록 / 내 강의 / 과제 / 평가 / 공지 / 게시판 / 성취·수료 / 사용자 매뉴얼 / 마이페이지’ 등 주요 메뉴가 모여 있습니다.",
        "가운데 영역: 선택한 메뉴의 내용(강의 카드, 차시 영상, 과제 작성 등)이 표시됩니다.",
        "오른쪽 상단: 내 이름·아바타, 종 모양 알림 아이콘, 언어 변경(한/영) 버튼이 있습니다.",
        "모바일에서는 좌측 메뉴가 숨겨져 있고, 왼쪽 위 ‘☰’ 버튼을 누르면 열립니다. 닫을 때는 메뉴 안의 ‘×’를 누르세요.",
      ],
      tips: [
        "‘대시보드’는 항상 첫 화면입니다. 길을 잃으면 좌측 메뉴 맨 위의 ‘대시보드’를 누르세요.",
        "글자가 작게 느껴진다면 브라우저 확대(Ctrl/⌘ + ‘+’)를 사용해도 됩니다.",
      ],
    },
    {
      id: "s-login",
      title: "1. 로그인하기 — 이메일과 비밀번호로 들어가기",
      summary: "회사에서 받은 이메일 주소와 비밀번호를 입력해 로그인합니다.",
      steps: [
        "주소창에 회사에서 안내한 학습 사이트 주소를 입력합니다. (예: https://nonfiction-academy.webheads.co.kr)",
        "‘이메일’ 칸에 본인 이메일 주소를, ‘비밀번호’ 칸에 비밀번호를 입력합니다.",
        "‘아이디 저장’을 체크해 두면, 다음에 접속할 때 이메일이 자동으로 채워져 편리합니다.",
        "‘로그인’ 버튼을 누릅니다. 정상이라면 곧바로 대시보드 화면으로 이동합니다.",
        "비밀번호가 기억나지 않으면 ‘비밀번호 재설정’을 눌러 이메일 주소를 입력하세요. 잠시 후 메일이 도착하고, 메일 안의 링크에서 새 비밀번호를 설정할 수 있습니다.",
      ],
      tips: [
        "이메일 인증 메일이 보이지 않으면 ‘스팸함’도 꼭 확인해 주세요.",
        "회사 계정 가입은 관리자가 미리 만들어 두는 경우가 많습니다. 로그인이 안 되면 담당자에게 문의하세요.",
        "공용 PC에서는 ‘아이디 저장’을 꺼 두는 것이 안전합니다.",
      ],
    },
    {
      id: "s-pwa",
      title: "2. 모바일 앱처럼 설치하기 (PWA)",
      summary: "스마트폰 홈 화면에 ‘앱 아이콘’을 추가하면 일반 앱처럼 한 번에 열 수 있습니다.",
      steps: [
        "iPhone(Safari): 화면 아래(또는 위) ‘공유’ 버튼 → ‘홈 화면에 추가’ → ‘추가’를 누릅니다.",
        "Android(Chrome): 오른쪽 위 ‘︙’ 메뉴 → ‘앱 설치’ 또는 ‘홈 화면에 추가’를 누릅니다.",
        "PC(Chrome/Edge): 주소창 오른쪽의 ‘설치’ 아이콘(작은 모니터+화살표)을 클릭합니다.",
        "설치 후 홈 화면 또는 바탕화면의 ‘NONFICTION Academy’ 아이콘을 누르면, 주소창 없이 전용 앱처럼 열립니다.",
      ],
      tips: [
        "설치하면 ‘플랫폼 업데이트 공지’를 가장 먼저 받아볼 수 있습니다.",
        "회사 정책으로 자동 설치 안내 팝업이 주기적으로 뜰 수 있습니다. 원치 않으면 ‘나중에’를 눌러도 됩니다.",
      ],
    },
    {
      id: "s-dashboard",
      title: "3. 대시보드 살펴보기 — 오늘 무엇을 해야 할까?",
      summary: "내 학습 상태를 한 화면에서 빠르게 확인합니다.",
      steps: [
        "‘진행 중인 강의’ 카드: 듣고 있는 강의의 진도율(%)이 막대로 표시됩니다.",
        "‘마감 임박 과제/평가’ 카드: 며칠 남았는지 D-day로 보여줍니다. 빨간색일수록 급한 일정입니다.",
        "‘최근 공지/알림’ 카드: 새 공지에는 24시간 동안 ‘NEW’ 표시가 붙습니다.",
        "각 카드의 제목이나 ‘바로가기’ 버튼을 누르면 해당 페이지로 이동합니다.",
      ],
      tips: ["대시보드는 5분마다 자동 새로고침되므로, 변경 사항이 곧 반영됩니다."],
    },
    {
      id: "s-catalog",
      title: "4. 강의 신청하기 — 듣고 싶은 강의를 찾아 신청",
      summary: "‘강의 목록(카탈로그)’에서 강의를 찾아 ‘수강 신청’ 버튼을 누릅니다.",
      steps: [
        "왼쪽 메뉴에서 ‘강의 목록’을 누릅니다.",
        "상단 검색창에 키워드를 입력하거나, 카테고리를 선택해 강의를 좁힙니다.",
        "강의 카드(이미지+제목)를 누르면 상세 페이지가 열립니다. 강의 소개, 차시(영상) 수, 예상 학습 시간, 수료 조건을 확인합니다.",
        "‘수강 신청’ 버튼을 누릅니다. 신청 즉시 등록되는 강의도 있고, ‘관리자 승인’이 필요한 강의도 있습니다.",
        "승인이 완료되면 ‘내 강의’ 메뉴에 자동으로 나타납니다. 알림 종에도 ‘승인 완료’ 메시지가 표시됩니다.",
      ],
      tips: [
        "‘필수 교육(의무 수강)’은 신청하지 않아도 자동으로 ‘내 강의’에 들어와 있습니다. 마감일이 정해져 있으니 D-day를 꼭 확인하세요.",
        "신청이 반려된 경우 사유가 알림으로 옵니다. 담당자에게 문의 후 다시 신청할 수 있습니다.",
      ],
    },
    {
      id: "s-learning",
      title: "5. 강의 듣기 — 차시(영상) 시청 방법",
      summary: "1강의 = 여러 ‘차시’로 구성되어 있고, 위에서 아래로 순서대로 학습합니다.",
      steps: [
        "‘내 강의’에서 학습할 강의를 선택합니다. 차시(예: ‘1차시 · 오리엔테이션’) 목록이 보입니다.",
        "원하는 차시를 클릭하면 영상 플레이어가 열립니다. 재생 버튼(▶)을 눌러 시청을 시작하세요.",
        "영상의 80% 이상을 시청하면 해당 차시가 자동으로 ‘완료’ 처리됩니다. (좌측 차시 목록에 ✓가 표시됨)",
        "‘다음 차시’ 버튼으로 바로 이어 듣거나, 차시 목록에서 다음 항목을 누르세요.",
        "학습 도중 창을 닫아도 진도는 10초 간격으로 자동 저장되므로, 다시 들어오면 본 지점부터 이어집니다.",
        "‘플립러닝(망고보드)’이나 ‘미디어 패키지(이미지+영상 슬라이드)’ 차시는 ▶ 대신 ‘다음’ 버튼을 직접 눌러 진행합니다.",
      ],
      tips: [
        "처음 보는 영상에서는 ‘빨리감기’가 제한될 수 있습니다. 한 번 완료한 차시는 자유롭게 이동 가능합니다.",
        "Wi-Fi 환경에서 시청하시고, 모바일 데이터를 사용할 때는 화질을 낮춰 데이터를 아끼세요.",
        "영상이 끊기면 잠시 멈춘 뒤 다시 재생하거나, 새로고침(F5) 한 번이면 대부분 해결됩니다.",
      ],
    },
    {
      id: "s-assignment",
      title: "6. 과제 제출하기 — 글과 파일을 함께 올리기",
      summary: "과제 작성 칸에 답을 쓰고, 필요하면 파일을 첨부해 ‘제출’을 누릅니다.",
      steps: [
        "왼쪽 메뉴 ‘과제’ 또는 강의 상세 안의 ‘과제’ 탭에서 과제 제목을 클릭합니다.",
        "‘마감일’과 ‘배점’, 그리고 강사가 안내한 ‘제출 방식’을 먼저 읽습니다.",
        "본문 입력 칸에 답안을 작성합니다. (글자 수 제한이 있는 경우 하단에 표시됩니다)",
        "필요하면 ‘파일 첨부’를 눌러 파일을 추가합니다. 최대 5개, 파일당 10MB 까지 가능합니다. (PDF, 이미지, 한글/워드 문서 등)",
        "‘임시 저장’을 누르면 작성 중 내용을 나중에 이어 쓸 수 있고, ‘제출’을 누르면 강사에게 전달됩니다.",
        "마감 전이라면 다시 들어가 수정 후 ‘재제출’이 가능합니다. (강사 채점 시작 후에는 잠길 수 있음)",
        "채점이 끝나면 ‘과제 결과’ 탭에서 점수와 코멘트를 확인합니다.",
      ],
      tips: [
        "파일 이름에 한글이 길게 들어가면 업로드가 느릴 수 있습니다. 영문/숫자로 간단히 바꾸면 좋습니다.",
        "마감 직전에는 접속이 몰려 느려질 수 있어요. 가능하면 마감 1~2일 전 제출을 권장합니다.",
      ],
    },
    {
      id: "s-assessment",
      title: "7. 평가(퀴즈) 응시하기",
      summary: "정해진 시간 안에 문제를 풀고 ‘제출’을 누릅니다.",
      steps: [
        "강의 상세 페이지의 ‘평가’ 항목 또는 ‘평가’ 메뉴에서 응시할 평가를 선택합니다.",
        "‘응시 시작’ 버튼을 누르면 제한 시간이 시작됩니다. 시작 후에는 일시정지가 불가능한 경우가 많습니다.",
        "각 문항의 보기 중 하나(또는 여러 개)를 선택하거나, 단답형의 경우 직접 입력합니다.",
        "모든 문항에 답한 뒤 화면 하단의 ‘제출’을 누릅니다. 시간이 초과되면 자동 제출됩니다.",
        "결과 화면에서 통과/미통과 여부와 점수를 확인합니다. 통과 시 30포인트, 미통과 또는 단순 완료 시 10포인트가 ‘학습 포인트’로 적립됩니다.",
      ],
      tips: [
        "응시 중에는 절대 새로고침(F5)을 누르지 마세요. 답안이 사라질 수 있습니다.",
        "‘재응시 허용’ 설정이 있는 경우 결과 화면에서 다시 도전할 수 있습니다.",
        "정답은 보안상 본인의 화면에서는 보이지 않습니다. 채점은 서버에서 안전하게 이루어집니다.",
      ],
    },
    {
      id: "s-attendance",
      title: "8. 출석 — 접속만 해도 자동 기록",
      summary: "별도 ‘출석 버튼’을 누르지 않아도, 학습 페이지에 머무르는 동안 자동으로 출석이 기록됩니다.",
      steps: [
        "강의 영상을 재생하거나, 학습 페이지를 열어두면 자동 집계됩니다.",
        "출석 결과는 강사/관리자가 확인하며, 본인은 ‘마이페이지 → 학습 이력’에서 확인 가능합니다.",
      ],
      tips: ["여러 탭을 열어두면 마지막으로 활성화된 탭 기준으로 기록됩니다. 한 번에 하나만 여는 것을 추천합니다."],
    },
    {
      id: "s-board",
      title: "9. 공지·게시판·알림 확인",
      summary: "공지사항, 자료실(게시판), 알림 종을 활용하세요.",
      steps: [
        "‘공지사항’: 회사 전체에 안내되는 글입니다. 최근 24시간 안에 올라온 글에는 ‘NEW’ 표시가 깜빡입니다.",
        "‘게시판’: 자료 다운로드, 댓글 작성이 가능합니다. 첨부파일은 클릭으로 바로 내려받을 수 있습니다.",
        "오른쪽 상단 종 모양 아이콘: 내 과제 마감, 평가 결과, 공지 등 개인 알림이 모입니다. 빨간 점이 보이면 새 알림이 있다는 뜻입니다.",
      ],
    },
    {
      id: "s-cert",
      title: "10. 수료증 받기",
      summary: "수료 조건을 모두 채우면 수료증이 자동으로 발급됩니다.",
      steps: [
        "강의 상세 페이지 상단의 ‘수료 조건’(진도 100%, 평가 통과, 과제 제출 등)을 확인하세요.",
        "모든 조건을 충족하면 ‘성취/수료’ 메뉴에 수료증이 생성됩니다.",
        "수료증 카드를 누르면 미리보기가 열리고, ‘PDF 다운로드’ 또는 ‘이미지 저장’을 누를 수 있습니다.",
        "필요 시 인쇄해 보관하거나, 사내 시스템에 업로드해 활용하세요.",
      ],
      tips: ["수료증에 표시되는 이름은 ‘마이페이지’의 이름과 같습니다. 표기가 잘못되었다면 마이페이지에서 수정 후 다시 발급받으세요."],
    },
    {
      id: "s-mypage",
      title: "11. 마이페이지 — 내 정보·아바타·언어",
      summary: "이름, 연락처, 비밀번호, 아바타, 사용 언어를 관리합니다.",
      steps: [
        "오른쪽 위 프로필 또는 좌측 메뉴 ‘마이페이지’를 누릅니다.",
        "‘기본 정보’ 탭: 이름, 연락처, 소속을 확인/수정합니다.",
        "‘비밀번호 변경’ 탭: 현재 비밀번호 + 새 비밀번호 입력으로 변경합니다.",
        "‘아바타’ 탭: 24종 프리셋 중 마음에 드는 캐릭터를 고르거나, 직접 사진을 업로드합니다.",
        "언어 변경: 우측 상단의 ‘한/EN’ 버튼으로 화면 언어를 즉시 전환할 수 있습니다.",
      ],
      tips: ["프로필 이미지는 가급적 정사각형(예: 512x512)으로 올리면 잘 보입니다."],
    },
    {
      id: "s-trouble",
      title: "12. 자주 묻는 문제 해결 (FAQ)",
      summary: "안 될 때 가장 먼저 시도해 보면 좋은 방법들입니다.",
      steps: [
        "로그인이 안 돼요 → 이메일·비밀번호 오타 확인, 대소문자 확인, ‘비밀번호 재설정’ 시도.",
        "영상이 재생되지 않아요 → 새로고침(F5) → 다른 브라우저(Chrome 권장) 시도 → Wi-Fi 변경.",
        "진도가 안 올라가요 → 80% 시청 여부 확인, 인터넷이 끊겼는지 확인, 5분 뒤 다시 접속.",
        "과제 파일이 업로드 안 돼요 → 파일 크기 10MB 이하인지, 개수 5개 이하인지 확인.",
        "평가 화면이 멈춰요 → 새로고침 금지! 잠시 기다린 뒤 ‘제출’을 시도하고, 안 되면 즉시 담당자에게 알림.",
      ],
      tips: [
        "해결되지 않으면 좌측 메뉴 ‘공지사항’의 운영팀 연락처 또는 ‘게시판 → 질문’에 문의를 남겨주세요.",
        "문의 시 ‘어떤 화면에서, 무엇을 눌렀더니, 어떤 메시지가 떴는지’를 적어주시면 훨씬 빨리 해결됩니다.",
      ],
    },
  ],
};

const STUDENT_EN: LocalizedManual = {
  label: "Learner",
  intro:
    "Welcome to the NONFICTION Academy Learner Manual. This guide walks you through everything from signing in to enrolling, watching lessons, submitting assignments and quizzes, getting your certificate, and even installing the site as a mobile app (PWA). Each chapter has plain-language steps and TIPs so first-time users can follow along easily.",
  sections: [
    {
      id: "s-overview",
      title: "0. Before You Start — Screen Layout at a Glance",
      summary: "The menu is on the left, content in the middle, your profile and notifications on the top-right.",
      steps: [
        "Left sidebar: Dashboard, Catalog, My Courses, Assignments, Assessments, Announcements, Board, Achievements & Certificates, User Manual, My Page.",
        "Center area: shows the content of the selected menu (course cards, video player, assignment editor, etc.).",
        "Top-right: your name and avatar, the bell icon for notifications, and the KO/EN language switch.",
        "On mobile, the left menu is hidden. Tap the ‘☰’ icon at the top-left to open it, and the ‘×’ inside to close it.",
      ],
      tips: [
        "‘Dashboard’ is always your home. If you get lost, click ‘Dashboard’ at the top of the left menu.",
        "If text feels small, use your browser zoom (Ctrl/⌘ + ‘+’).",
      ],
    },
    {
      id: "s-login",
      title: "1. Logging In",
      summary: "Sign in with the email and password your administrator provided.",
      steps: [
        "Open the learning site URL provided by your company (e.g., https://nonfiction-academy.webheads.co.kr).",
        "Enter your email and password.",
        "Tick ‘Remember email’ to auto-fill your address next time.",
        "Click ‘Sign in’. You will land on the Dashboard.",
        "Forgot your password? Click ‘Reset password’, enter your email, and follow the link sent to your inbox.",
      ],
      tips: [
        "Check your spam folder if the verification email doesn’t arrive.",
        "Most accounts are pre-created by your administrator. Contact them if you cannot sign in.",
        "On shared computers, leave ‘Remember email’ unchecked.",
      ],
    },
    {
      id: "s-pwa",
      title: "2. Install as a Mobile App (PWA)",
      summary: "Add the site to your home screen to open it like a native app.",
      steps: [
        "iPhone (Safari): tap Share → ‘Add to Home Screen’ → ‘Add’.",
        "Android (Chrome): tap ‘︙’ → ‘Install app’ or ‘Add to Home screen’.",
        "Desktop (Chrome/Edge): click the install icon on the right side of the address bar.",
        "After installing, tap the NONFICTION Academy icon to open it without a browser address bar.",
      ],
      tips: [
        "Installed users receive platform update notices first.",
        "An install prompt may appear periodically; you can dismiss it with ‘Later’.",
      ],
    },
    {
      id: "s-dashboard",
      title: "3. Reading Your Dashboard",
      summary: "See everything you need to do today at a glance.",
      steps: [
        "‘Courses in progress’ shows a percentage bar for each active course.",
        "‘Upcoming deadlines’ shows D-day badges for assignments and assessments. Red = urgent.",
        "‘Recent announcements’ shows a flashing ‘NEW’ for posts from the last 24 hours.",
        "Click a card title or ‘Go’ to jump to that page.",
      ],
      tips: ["The dashboard auto-refreshes every 5 minutes."],
    },
    {
      id: "s-catalog",
      title: "4. Enrolling in a Course",
      summary: "Find a course in the Catalog and click ‘Enroll’.",
      steps: [
        "Click ‘Catalog’ in the left menu.",
        "Use the search box or category filter to narrow the list.",
        "Click a course card to open its details: description, number of lessons, estimated time, completion criteria.",
        "Click ‘Enroll’. Some courses are instant; others need admin approval.",
        "Once approved, the course appears in ‘My Courses’ and you receive a notification.",
      ],
      tips: [
        "Mandatory training is auto-assigned and appears in ‘My Courses’ without enrollment. Check the D-day.",
        "If your request is rejected, the reason appears in your notifications.",
      ],
    },
    {
      id: "s-learning",
      title: "5. Watching Lessons",
      summary: "One course = several ‘lessons’. Follow them top-down in order.",
      steps: [
        "Open a course in ‘My Courses’ to see its lesson list.",
        "Click a lesson to open the video player and press ▶ to start.",
        "Watching 80% or more of a video automatically marks the lesson complete (✓).",
        "Use ‘Next lesson’ or click the next item in the list to continue.",
        "Progress is saved every 10 seconds — close the tab safely and resume later.",
        "Flip-learning (Mangoboard) and Media Package lessons advance by clicking ‘Next’ instead of pressing play.",
      ],
      tips: [
        "Fast-forward may be disabled on first watch; once complete you can scrub freely.",
        "Use Wi-Fi when possible, or lower the quality on mobile data.",
        "If a video stutters, pause briefly or refresh once (F5).",
      ],
    },
    {
      id: "s-assignment",
      title: "6. Submitting an Assignment",
      summary: "Write your answer, attach files if needed, and click Submit.",
      steps: [
        "Open ‘Assignments’ in the left menu, or the Assignments tab inside a course.",
        "Read the due date, score, and instructor’s submission rules.",
        "Type your answer in the editor (word limits, if any, appear at the bottom).",
        "Click ‘Attach files’ to add up to 5 files, max 10 MB each (PDF, image, doc, etc.).",
        "Use ‘Save draft’ to keep editing later, or ‘Submit’ to send it to the instructor.",
        "Before the deadline you can edit and resubmit. (Locked once grading begins.)",
        "When grading is done, the score and feedback appear under ‘Results’.",
      ],
      tips: [
        "Use simple ASCII filenames for faster uploads.",
        "Submit 1–2 days before the deadline to avoid traffic peaks.",
      ],
    },
    {
      id: "s-assessment",
      title: "7. Taking an Assessment (Quiz)",
      summary: "Answer within the time limit and click Submit.",
      steps: [
        "Open the Assessments section of a course or the Assessments menu.",
        "Click ‘Start’ to begin — most assessments cannot be paused.",
        "Select option(s) or type a short answer for each question.",
        "Click ‘Submit’ at the bottom. If time runs out, your answers are submitted automatically.",
        "Pass = 30 learning points; Fail or simple completion = 10 points.",
      ],
      tips: [
        "Never refresh the page during a quiz — your answers may be lost.",
        "If retakes are allowed, the option appears on the results screen.",
        "Correct answers are never shown on your screen; grading happens securely on the server.",
      ],
    },
    {
      id: "s-attendance",
      title: "8. Attendance — Recorded Automatically",
      summary: "There is no attendance button. Your time on learning pages counts as attendance.",
      steps: [
        "Playing a video or staying on a learning page records attendance automatically.",
        "You can review your own attendance in ‘My Page → Learning history’.",
      ],
      tips: ["When multiple tabs are open, only the active tab is counted. Keep one tab open."],
    },
    {
      id: "s-board",
      title: "9. Announcements, Board, and Notifications",
      summary: "Use these three channels to stay updated.",
      steps: [
        "‘Announcements’: company-wide posts. New posts (within 24h) show a pulsing ‘NEW’ badge.",
        "‘Board’: download resources and post comments. Attachments download in one click.",
        "Bell icon (top-right): personal notifications (deadlines, results, posts). A red dot means unread items.",
      ],
    },
    {
      id: "s-cert",
      title: "10. Getting Your Certificate",
      summary: "Meet the completion criteria and your certificate is issued automatically.",
      steps: [
        "Check the course’s completion criteria (progress, passing the assessment, submitting assignments).",
        "Once all conditions are met, the certificate appears under ‘Achievements & Certificates’.",
        "Click the certificate card to preview, then ‘Download PDF’ or ‘Save image’.",
        "Print it or upload it to your internal HR system as needed.",
      ],
      tips: ["The name on the certificate matches your ‘My Page’ name. Fix it there and re-issue if it’s wrong."],
    },
    {
      id: "s-mypage",
      title: "11. My Page — Profile, Avatar, Language",
      summary: "Manage your name, contact, password, avatar, and display language.",
      steps: [
        "Open ‘My Page’ from the top-right profile or the left menu.",
        "‘Basic info’: review and edit name, contact, and organization.",
        "‘Change password’: enter your current and new passwords.",
        "‘Avatar’: choose one of 24 presets or upload your own image.",
        "Use the KO/EN switch at the top-right to change the interface language instantly.",
      ],
      tips: ["Use a square image (e.g., 512×512) for the best avatar result."],
    },
    {
      id: "s-trouble",
      title: "12. Troubleshooting (FAQ)",
      summary: "Try these first when something doesn’t work.",
      steps: [
        "Can’t sign in → check email/password (case-sensitive), then try ‘Reset password’.",
        "Video won’t play → refresh (F5) → try Chrome → switch Wi-Fi.",
        "Progress not moving → confirm 80% watched, check the connection, retry in 5 minutes.",
        "Upload fails → ensure each file is under 10 MB and you have 5 or fewer files.",
        "Quiz screen freezes → DO NOT refresh. Wait, then click Submit. If it still fails, contact the admin immediately.",
      ],
      tips: [
        "If problems persist, contact the operations team via the announcements or post a question on the board.",
        "Describe the screen, the button you clicked, and the error message — it speeds up support.",
      ],
    },
  ],
};

const STUDENT_JA: LocalizedManual = {
  label: "受講者",
  intro:
    "NONFICTION Academy 受講者マニュアルです。初めての方でも迷わないように、ログインから受講申込、レッスン視聴、課題・テストの提出、修了証の取得、モバイルアプリ(PWA)の導入まで、順を追って丁寧に説明します。各章の「やさしく言うと」と「ヒント」を参考にしてください。",
  sections: [
    {
      id: "s-overview",
      title: "0. はじめに — 画面の見方",
      summary: "左がメニュー、中央が内容、右上が自分の情報と通知です。",
      steps: [
        "左サイドバー:ダッシュボード/受講可能講座(カタログ)/マイ講座/課題/テスト/お知らせ/掲示板/実績・修了/ユーザーマニュアル/マイページ。",
        "中央エリア:選択したメニューの内容(講座カード、動画、課題作成画面など)が表示されます。",
        "右上:氏名・アバター、ベルアイコン(通知)、KO/EN の言語切替ボタン。",
        "スマートフォンでは左メニューが隠れています。左上の「☰」で開き、メニュー内の「×」で閉じます。",
      ],
      tips: [
        "「ダッシュボード」が常にホームです。迷ったら左メニュー最上部の「ダッシュボード」をタップ。",
        "文字が小さい場合はブラウザのズーム(Ctrl/⌘ + ‘+’)を使えます。",
      ],
    },
    {
      id: "s-login",
      title: "1. ログイン",
      summary: "会社から案内されたメールアドレスとパスワードでログインします。",
      steps: [
        "案内されたURL(例:https://nonfiction-academy.webheads.co.kr)を開きます。",
        "「メール」と「パスワード」を入力します。",
        "「IDを保存」にチェックを入れると次回からメールが自動入力されます。",
        "「ログイン」を押すとダッシュボードに移動します。",
        "パスワードを忘れた場合は「パスワード再設定」からメールを送信し、届いたリンクで新しいパスワードを設定します。",
      ],
      tips: [
        "認証メールが届かない場合は迷惑メールフォルダも確認してください。",
        "アカウントは管理者が事前に作成していることが多いです。ログインできない場合は担当者に連絡を。",
        "共有PCでは「IDを保存」をオフにしておくと安全です。",
      ],
    },
    {
      id: "s-pwa",
      title: "2. モバイルアプリとしてインストール(PWA)",
      summary: "ホーム画面にアイコンを追加すれば、ネイティブアプリのように開けます。",
      steps: [
        "iPhone(Safari):共有ボタン → 「ホーム画面に追加」 → 「追加」。",
        "Android(Chrome):「︙」 → 「アプリをインストール」または「ホーム画面に追加」。",
        "PC(Chrome/Edge):アドレスバー右側の「インストール」アイコンをクリック。",
        "インストール後はアイコンから直接アプリのように起動できます。",
      ],
      tips: [
        "インストール済みユーザーには更新通知が優先的に届きます。",
        "インストール案内は定期的に表示されます。不要なときは「あとで」を選択。",
      ],
    },
    {
      id: "s-dashboard",
      title: "3. ダッシュボードの見方",
      summary: "今日やるべきことを一画面で把握できます。",
      steps: [
        "「進行中の講座」:各講座の進捗率が%で表示されます。",
        "「提出期限が近い課題・テスト」:残日数(D-day)が表示され、赤いほど急ぎです。",
        "「最新のお知らせ」:24時間以内の新規投稿には「NEW」が点滅します。",
        "カードのタイトルや「移動」ボタンを押すと該当ページへ。",
      ],
      tips: ["ダッシュボードは5分ごとに自動更新されます。"],
    },
    {
      id: "s-catalog",
      title: "4. 講座を申し込む",
      summary: "「カタログ」で講座を探し、「受講申込」を押します。",
      steps: [
        "左メニューの「カタログ」を開きます。",
        "上部の検索またはカテゴリで絞り込みます。",
        "講座カードをタップして詳細(紹介、レッスン数、目安時間、修了条件)を確認。",
        "「受講申込」を押します。即時登録の講座と、管理者承認が必要な講座があります。",
        "承認されると「マイ講座」に自動追加され、通知が届きます。",
      ],
      tips: [
        "必修教育は申込不要で「マイ講座」に自動登録されます。期限(D-day)を必ず確認。",
        "申込が却下された場合は通知に理由が記載されます。",
      ],
    },
    {
      id: "s-learning",
      title: "5. レッスンを受講する",
      summary: "1講座は複数の「レッスン」で構成され、上から順に学習します。",
      steps: [
        "「マイ講座」から学習する講座を選び、レッスン一覧を表示します。",
        "レッスンをタップしてプレーヤーを開き、▶ で再生します。",
        "動画を80%以上視聴すると自動的に「完了」(✓)になります。",
        "「次のレッスン」または一覧から次を選択して継続。",
        "進捗は10秒ごとに自動保存されるため、閉じても再開できます。",
        "フリップラーニング(Mangoboard)や Media Package のレッスンは「次へ」ボタンで進めます。",
      ],
      tips: [
        "初回視聴は早送りが制限される場合があります。完了後は自由に移動可能。",
        "Wi-Fi推奨。モバイルデータの場合は画質を下げると安心です。",
        "止まる場合は一時停止または再読み込み(F5)で改善することが多いです。",
      ],
    },
    {
      id: "s-assignment",
      title: "6. 課題を提出する",
      summary: "本文を入力し、必要ならファイルを添付して「提出」を押します。",
      steps: [
        "左メニュー「課題」または講座内の「課題」タブから対象を開きます。",
        "提出期限、配点、講師の提出方法をまず確認。",
        "本文欄に解答を入力(文字数制限がある場合は下部に表示)。",
        "「ファイル添付」で最大5個、各10MBまで(PDF/画像/文書など)。",
        "「下書き保存」で続きを書け、「提出」で講師へ送信。",
        "期限前なら修正して再提出可能(採点開始後はロック)。",
        "採点後は「結果」タブで点数とフィードバックを確認。",
      ],
      tips: [
        "ファイル名はシンプルな英数字にすると安定します。",
        "締切1〜2日前の提出が安全です。",
      ],
    },
    {
      id: "s-assessment",
      title: "7. テスト(クイズ)を受ける",
      summary: "制限時間内に解答し、「提出」を押します。",
      steps: [
        "講座の「テスト」項目またはメニューからテストを開きます。",
        "「開始」を押すと時間が始まります。多くの場合一時停止できません。",
        "各問題で選択肢を選ぶ、または短答を入力します。",
        "下部の「提出」を押します。時間切れの場合は自動提出。",
        "合格で30ポイント、不合格または単純完了で10ポイントが学習ポイントとして付与。",
      ],
      tips: [
        "受験中は絶対に再読み込みしないでください(回答が消える恐れ)。",
        "再受験が許可されている場合は結果画面に表示されます。",
        "正解は画面に表示されません。採点はサーバーで安全に行われます。",
      ],
    },
    {
      id: "s-attendance",
      title: "8. 出席 — 自動で記録",
      summary: "出席ボタンはありません。学習ページの滞在時間が自動で出席になります。",
      steps: [
        "動画再生や学習ページの滞在で自動集計。",
        "自分の出席は「マイページ → 学習履歴」で確認できます。",
      ],
      tips: ["複数タブを開いている場合はアクティブなタブのみ計測されます。"],
    },
    {
      id: "s-board",
      title: "9. お知らせ・掲示板・通知",
      summary: "3つのチャネルで最新情報を確認しましょう。",
      steps: [
        "「お知らせ」:全社向けの投稿。24時間以内の新着には「NEW」が点滅。",
        "「掲示板」:資料のダウンロードやコメントが可能。",
        "ベルアイコン(右上):個人通知(締切、結果、お知らせ)。赤い点は未読あり。",
      ],
    },
    {
      id: "s-cert",
      title: "10. 修了証を受け取る",
      summary: "修了条件を満たすと自動で発行されます。",
      steps: [
        "講座の修了条件(進捗、テスト合格、課題提出)を確認。",
        "条件を満たすと「実績・修了」メニューに修了証が表示されます。",
        "カードをタップしてプレビューし、「PDFダウンロード」または「画像保存」が可能。",
        "印刷や社内システムへのアップロードに利用できます。",
      ],
      tips: ["修了証の氏名は「マイページ」と同じです。表記が違う場合は修正後に再発行してください。"],
    },
    {
      id: "s-mypage",
      title: "11. マイページ — プロフィール・アバター・言語",
      summary: "氏名、連絡先、パスワード、アバター、表示言語を管理します。",
      steps: [
        "右上のプロフィールまたは左メニューの「マイページ」を開きます。",
        "「基本情報」:氏名・連絡先・所属を確認/編集。",
        "「パスワード変更」:現行+新規パスワードを入力して変更。",
        "「アバター」:24種類のプリセットから選択、または自分の画像をアップロード。",
        "右上の KO/EN ボタンで画面言語を即時切替。",
      ],
      tips: ["アバターは正方形画像(512×512など)が綺麗に表示されます。"],
    },
    {
      id: "s-trouble",
      title: "12. よくあるトラブル(FAQ)",
      summary: "うまくいかない時にまず試したいこと。",
      steps: [
        "ログイン不可 → メール/パスワードの綴り・大文字小文字を確認 → 「パスワード再設定」。",
        "動画が再生されない → 再読み込み(F5) → Chromeを試す → Wi-Fiを切替。",
        "進捗が進まない → 80%視聴を確認、接続を確認、5分後に再度確認。",
        "ファイルアップロード失敗 → 各10MB以下、最大5個以内を確認。",
        "テスト画面が固まる → 再読み込みは絶対ダメ。少し待ってから提出、ダメなら即担当者へ。",
      ],
      tips: [
        "解決しない場合は「お知らせ」記載の運営チーム連絡先、または掲示板「質問」へ。",
        "「どの画面で、何を押したら、どんなメッセージが出たか」を伝えるとスムーズです。",
      ],
    },
  ],
};

// ===== 강사/관리자 매뉴얼 (한국어 표시 + 한국어 PDF) =====

const TEACHER_KO: LocalizedManual = {
  label: "러닝 리더(강사)",
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
};

const ADMIN_KO: LocalizedManual = {
  label: "관리자",
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
};

const MANUALS: RoleManual[] = [
  {
    role: "student",
    icon: GraduationCap,
    i18n: { ko: STUDENT_KO, en: STUDENT_EN, ja: STUDENT_JA },
  },
  {
    role: "teacher",
    icon: Users,
    i18n: { ko: TEACHER_KO },
  },
  {
    role: "admin",
    icon: ShieldCheck,
    i18n: { ko: ADMIN_KO },
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

const LANG_LABEL: Record<Lang, string> = {
  ko: "한국어 (Korean)",
  en: "English",
  ja: "日本語 (Japanese)",
};

const ManualPanel = ({ manual, query }: { manual: RoleManual; query: string }) => {
  const Icon = manual.icon;
  const loc = manual.i18n.ko!; // 화면 표시는 한국어 기준
  const sections = useMemo(() => filterSections(loc.sections, query), [loc.sections, query]);
  const availableLangs = (Object.keys(manual.i18n) as Lang[]);

  return (
    <div className="space-y-5">
      <div className="stat-card">
        <div className="flex items-start gap-3">
          <Icon className="h-6 w-6 text-foreground mt-0.5" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground">{loc.label} 매뉴얼</h2>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{loc.intro}</p>
              </div>
              {availableLangs.length > 1 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="shrink-0 gap-2 whitespace-nowrap">
                      <Languages className="h-4 w-4" />
                      PDF 다운로드
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {availableLangs.map((lng) => (
                      <DropdownMenuItem
                        key={lng}
                        onClick={() => downloadManualPdf(manual.i18n[lng]!, lng)}
                        className="gap-2"
                      >
                        <Download className="h-4 w-4" />
                        {LANG_LABEL[lng]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadManualPdf(loc, "ko")}
                  className="shrink-0 gap-2 whitespace-nowrap"
                >
                  <Download className="h-4 w-4" />
                  PDF 다운로드
                </Button>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <Badge variant="secondary" className="font-normal">총 {loc.sections.length}개 챕터</Badge>
              {availableLangs.length > 1 && (
                <Badge variant="outline" className="font-normal">
                  PDF: {availableLangs.map((l) => l.toUpperCase()).join(" · ")}
                </Badge>
              )}
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
  const { primaryRole, isStudent, isTeacher, isAdmin } = useUserRole();
  const [query, setQuery] = useState("");
  // 직전에 사용 중이던 대시보드 컨텍스트를 우선 사용 (학생 사이드바에서 진입했는데 admin 레이아웃이 뜨는 문제 방지)
  const lastRole = (() => {
    try { return sessionStorage.getItem("lastDashboardRole") as "student" | "teacher" | "admin" | null; } catch { return null; }
  })();
  const hasRole = (r: "student" | "teacher" | "admin") =>
    r === "admin" ? isAdmin : r === "teacher" ? isTeacher : isStudent;
  const layoutRole = (lastRole && hasRole(lastRole)) ? lastRole : (primaryRole as "student" | "teacher" | "admin");
  const defaultTab =
    layoutRole === "admin" ? "admin" : layoutRole === "teacher" ? "teacher" : "student";

  return (
    <DashboardLayout role={layoutRole}>

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
              const label = m.i18n.ko!.label;
              return (
                <TabsTrigger key={m.role} value={m.role} className="gap-2 text-sm">
                  <Icon className="h-4 w-4" />
                  {label}
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
