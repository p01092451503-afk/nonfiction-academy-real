/**
 * Regression test: the quiz language choice must never leak between accounts
 * that share the same browser/PWA profile.
 *
 * Real incident (2026-08): a Cantonese (HK) user picked 廣東話 on a shared
 * store device; the next Japanese user opened the same quiz and got the
 * Cantonese setting, so the questions never rendered in Japanese.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const COURSE_ID = "11111111-1111-1111-1111-111111111111";
const ASSESSMENT_ID = "22222222-2222-2222-2222-222222222222";
const QUESTION_ID = "33333333-3333-3333-3333-333333333333";

const HK_USER = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  email: "hk.user@nonfiction.com",
  departmentId: "hk-dept",
};
const JP_USER = {
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  email: "ayako.horiguchi@nonfiction.com",
  departmentId: "jp-dept",
};

const langKey = (userId: string) => `assessment-lang:${userId}:${ASSESSMENT_ID}`;
const legacyKey = `assessment-lang:${ASSESSMENT_ID}`;

const h = vi.hoisted(() => {
  const ASSESSMENT_ID = "22222222-2222-2222-2222-222222222222";
  const QUESTION_ID = "33333333-3333-3333-3333-333333333333";

  const state = {
    user: { id: "", email: "" },
    departmentId: "",
  };

  const KO_QUESTION = {
    id: QUESTION_ID,
    assessment_id: ASSESSMENT_ID,
    question_text: "고객 응대의 첫 단계는 무엇입니까?",
    question_type: "multiple_choice_4",
    options: ["경청하기", "제안하기", "종결하기", "기록하기"],
    correct_answer: "경청하기",
    hint: null,
    explanation: null,
    order_index: 0,
    points: 10,
  };

  const departments: Record<string, any> = {
    "hk-dept": { id: "hk-dept", country: "HK", parent_department_id: null },
    "jp-dept": { id: "jp-dept", country: "JP", parent_department_id: null },
  };

  const assessmentI18n = [
    { assessment_id: ASSESSMENT_ID, language_code: "ja", title: "接客評価", description: null },
    { assessment_id: ASSESSMENT_ID, language_code: "yue", title: "顧客服務評估", description: null },
    { assessment_id: ASSESSMENT_ID, language_code: "zh-CN", title: "客户服务评估", description: null },
    { assessment_id: ASSESSMENT_ID, language_code: "en", title: "Service Assessment", description: null },
  ];

  const questionI18n = [
    {
      question_id: QUESTION_ID,
      language_code: "ja",
      question_text: "接客の最初のステップは何ですか？",
      options: ["傾聴する", "提案する", "クロージングする", "記録する"],
      correct_answer: "傾聴する",
      hint: null,
      explanation: null,
    },
    {
      question_id: QUESTION_ID,
      language_code: "yue",
      question_text: "接待客人嘅第一步係咩？",
      options: ["聆聽", "建議", "結單", "記錄"],
      correct_answer: "聆聽",
      hint: null,
      explanation: null,
    },
  ];

  const tables: Record<string, any[]> = {
    departments: Object.values(departments),
    assessments: [
      {
        id: ASSESSMENT_ID,
        course_id: "11111111-1111-1111-1111-111111111111",
        title: "고객 응대 평가",
        description: null,
        passing_score: 60,
        max_attempts: 3,
        time_limit_minutes: null,
        randomize_questions: false,
      },
    ],
    assessment_attempts: [],
    assessment_i18n: assessmentI18n,
    assessment_question_i18n: questionI18n,
    assessment_answers: [],
  };

  const makeBuilder = (table: string) => {
    const filters: Array<[string, any]> = [];
    let inserted = false;
    const rows = () =>
      (tables[table] || []).filter((row) => filters.every(([col, val]) => row?.[col] === val));
    const builder: any = {
      select: () => builder,
      insert: (payload: any) => {
        inserted = true;
        if (table === "assessment_attempts") tables.assessment_attempts.push({ id: "attempt-1", ...payload });
        return builder;
      },
      update: () => builder,
      eq: (col: string, val: any) => {
        filters.push([col, val]);
        return builder;
      },
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      single: async () =>
        inserted ? { data: { id: "attempt-1" }, error: null } : { data: rows()[0] ?? null, error: null },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: rows(), error: null }).then(resolve),
    };
    return builder;
  };

  return { state, KO_QUESTION, makeBuilder, tables };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => h.makeBuilder(table),
    rpc: async (name: string) => {
      if (name === "get_assessment_questions_for_student") return { data: [h.KO_QUESTION], error: null };
      if (name === "get_assessment_questions_with_answers") return { data: [h.KO_QUESTION], error: null };
      return { data: null, error: null };
    },
    functions: { invoke: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }) },
    auth: { getUser: async () => ({ data: { user: null } }) },
  },
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({
    user: h.state.user.id ? h.state.user : null,
    session: {},
    profile: h.state.user.id
      ? { user_id: h.state.user.id, department_id: h.state.departmentId, full_name: "tester" }
      : null,
    roles: ["student"],
    isLoading: false,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ role: "student", primaryRole: "student", roles: ["student"], isLoading: false }),
}));

vi.mock("@/components/layouts/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any) => (typeof fallback === "string" ? fallback : key),
    i18n: { language: "ko", changeLanguage: vi.fn() },
  }),
}));

import AssessmentPage from "./AssessmentPage";

const signIn = (account: { id: string; email: string; departmentId: string }) => {
  h.state.user = { id: account.id, email: account.email };
  h.state.departmentId = account.departmentId;
};

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/student/courses/${COURSE_ID}/assessment/${ASSESSMENT_ID}`]}>
        <Routes>
          <Route path="/student/courses/:courseId/assessment/:assessmentId" element={<AssessmentPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("AssessmentPage — quiz language does not leak across accounts", () => {
  beforeEach(() => {
    localStorage.clear();
    h.tables.assessment_attempts.length = 0;
  });

  it("keeps each account's explicit choice under its own storage key", async () => {
    const user = userEvent.setup();

    // 1) HK account explicitly picks Cantonese.
    signIn(HK_USER);
    const hk = renderPage();
    expect(await screen.findByText("顧客服務評估")).toBeInTheDocument();
    await user.click(await screen.findByRole("combobox", { name: "퀴즈 언어 선택" }));
    await user.click(await screen.findByRole("option", { name: "廣東話" }));
    await waitFor(() => expect(localStorage.getItem(langKey(HK_USER.id))).toBe("yue"));
    hk.unmount();

    // 2) JP account signs in on the same browser and must get Japanese.
    signIn(JP_USER);
    const jp = renderPage();
    expect(await screen.findByText("接客評価")).toBeInTheDocument();
    expect(screen.queryByText("顧客服務評估")).not.toBeInTheDocument();
    // No implicit write under the JP account, and the HK choice is untouched.
    expect(localStorage.getItem(langKey(JP_USER.id))).toBeNull();
    expect(localStorage.getItem(langKey(HK_USER.id))).toBe("yue");
    jp.unmount();

    // 3) HK account returns and still gets its own Cantonese choice.
    signIn(HK_USER);
    renderPage();
    expect(await screen.findByText("顧客服務評估")).toBeInTheDocument();
    expect(localStorage.getItem(langKey(HK_USER.id))).toBe("yue");
  });

  it("removes the legacy account-agnostic key instead of applying it", async () => {
    localStorage.setItem(legacyKey, "yue");
    signIn(JP_USER);
    renderPage();

    expect(await screen.findByText("接客評価")).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem(legacyKey)).toBeNull());
    expect(localStorage.getItem(langKey(JP_USER.id))).toBeNull();
  });

  it("does not persist the automatic yue → zh-CN fallback as a user choice", async () => {
    // Remove Cantonese question translations so the page auto-falls back.
    const yueRows = h.tables.assessment_question_i18n.filter((r: any) => r.language_code === "yue");
    h.tables.assessment_question_i18n = h.tables.assessment_question_i18n.filter(
      (r: any) => r.language_code !== "yue"
    );

    signIn(HK_USER);
    renderPage();

    expect(await screen.findByText("客户服务评估")).toBeInTheDocument();
    // Automatic fallback is session-only: nothing written for this account.
    expect(localStorage.getItem(langKey(HK_USER.id))).toBeNull();
    expect(localStorage.getItem(legacyKey)).toBeNull();

    h.tables.assessment_question_i18n.push(...yueRows);
  });
});
