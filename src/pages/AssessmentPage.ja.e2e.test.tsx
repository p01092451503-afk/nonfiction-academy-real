/**
 * E2E-style scenario test: a Japanese-branch account must always see the
 * Japanese version of assessment questions (never the Korean source, never a
 * stuck "translating" placeholder).
 *
 * The whole AssessmentPage is rendered with the backend mocked, so the test
 * covers the real user flow: open the quiz page -> start the attempt ->
 * read the question and its options.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const COURSE_ID = "11111111-1111-1111-1111-111111111111";
const ASSESSMENT_ID = "22222222-2222-2222-2222-222222222222";
const QUESTION_ID = "33333333-3333-3333-3333-333333333333";
const JP_DEPARTMENT_ID = "44444444-4444-4444-4444-444444444444";
const JP_USER_ID = "55555555-5555-5555-5555-555555555555";

const h = vi.hoisted(() => {
  const functionsInvoke = vi.fn();
  const KO_QUESTION = {
    id: "33333333-3333-3333-3333-333333333333",
    assessment_id: "22222222-2222-2222-2222-222222222222",
    question_text: "고객 응대의 첫 단계는 무엇입니까?",
    question_type: "multiple_choice_4",
    options: ["경청하기", "제안하기", "종결하기", "기록하기"],
    correct_answer: "경청하기",
    hint: null,
    explanation: null,
    order_index: 0,
    points: 10,
  };
  const JA_QUESTION_I18N = {
    question_id: KO_QUESTION.id,
    language_code: "ja",
    question_text: "接客の最初のステップは何ですか？",
    options: ["傾聴する", "提案する", "クロージングする", "記録する"],
    correct_answer: "傾聴する",
    hint: null,
    explanation: null,
  };
  const tableData: Record<string, any> = {
    departments: { country: "JP", parent_department_id: null },
    assessments: {
      id: KO_QUESTION.assessment_id,
      course_id: "11111111-1111-1111-1111-111111111111",
      title: "고객 응대 평가",
      description: null,
      passing_score: 60,
      max_attempts: 3,
      time_limit_minutes: null,
      randomize_questions: false,
    },
    assessment_attempts: [] as any[],
    assessment_i18n: { assessment_id: KO_QUESTION.assessment_id, language_code: "ja", title: "接客評価", description: null },
    assessment_question_i18n: [JA_QUESTION_I18N],
    assessment_answers: [],
  };
  const makeBuilder = (table: string) => {
    let inserted = false;
    const builder: any = {
      select: () => builder,
      insert: (payload: any) => {
        inserted = true;
        if (table === "assessment_attempts") tableData.assessment_attempts.push({ id: "attempt-1", ...payload });
        return builder;
      },
      update: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      single: async () =>
        inserted ? { data: { id: "attempt-1" }, error: null } : { data: tableData[table] ?? null, error: null },
      maybeSingle: async () => ({ data: tableData[table] ?? null, error: null }),
      then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: tableData[table] ?? [], error: null }).then(resolve),
    };
    return builder;
  };
  return { functionsInvoke, KO_QUESTION, JA_QUESTION_I18N, tableData, makeBuilder };
});

const { functionsInvoke, KO_QUESTION, JA_QUESTION_I18N, tableData } = h;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => h.makeBuilder(table),
    rpc: async (name: string) => {
      if (name === "get_assessment_questions_for_student") return { data: [h.KO_QUESTION], error: null };
      if (name === "get_assessment_questions_with_answers") return { data: [h.KO_QUESTION], error: null };
      return { data: null, error: null };
    },
    functions: { invoke: h.functionsInvoke },
  },
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({
    user: { id: "55555555-5555-5555-5555-555555555555", email: "ayako.horiguchi@nonfiction.com" },
    session: {},
    profile: { user_id: "55555555-5555-5555-5555-555555555555", department_id: "44444444-4444-4444-4444-444444444444", full_name: "堀口 綾子" },
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

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: any) => (typeof fallback === "string" ? fallback : key),
    i18n: { language: "ja", changeLanguage: vi.fn() },
  }),
}));

import AssessmentPage from "./AssessmentPage";

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

describe("AssessmentPage — Japanese branch account", () => {
  beforeEach(() => {
    localStorage.clear();
    functionsInvoke.mockReset();
    functionsInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    tableData.assessment_attempts.length = 0;
  });

  it("shows the Japanese assessment title on the entry screen", async () => {
    renderPage();
    expect(await screen.findByText("接客評価")).toBeInTheDocument();
    expect(screen.queryByText("고객 응대 평가")).not.toBeInTheDocument();
  });

  it("renders the question and options in Japanese after starting the attempt", async () => {
    const user = userEvent.setup();
    renderPage();

    const startButton = await screen.findByRole("button", { name: "assessment.startAssessment" });
    await waitFor(() => expect(startButton).not.toBeDisabled());
    await user.click(startButton);

    expect(await screen.findByText("接客の最初のステップは何ですか？")).toBeInTheDocument();
    for (const option of JA_QUESTION_I18N.options) {
      expect(screen.getByText(option)).toBeInTheDocument();
    }
    // No Korean source text and no stuck "translating" placeholder.
    expect(screen.queryByText(KO_QUESTION.question_text)).not.toBeInTheDocument();
    for (const koOption of KO_QUESTION.options) {
      expect(screen.queryByText(koOption)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/翻訳中/)).not.toBeInTheDocument();
  });

  it("does not inherit another account's language choice stored on the same browser", async () => {
    // Legacy (account-agnostic) key left behind by a previous Cantonese user.
    localStorage.setItem(`assessment-lang:${ASSESSMENT_ID}`, "yue");
    renderPage();

    expect(await screen.findByText("接客評価")).toBeInTheDocument();
    await waitFor(() =>
      expect(localStorage.getItem(`assessment-lang:${ASSESSMENT_ID}`)).toBeNull()
    );
    expect(localStorage.getItem(`assessment-lang:${JP_USER_ID}:${ASSESSMENT_ID}`)).toBeNull();
  });
});
