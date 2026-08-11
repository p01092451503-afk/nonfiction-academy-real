/**
 * E2E scenario: shared/public browser (store iPad, PWA kiosk) where several
 * accounts take the same quiz one after another.
 *
 * Regression guard: a Simplified Chinese (zh-CN) or Cantonese (yue) selection
 * made by one account must never be applied to the next account that signs in,
 * and signing out must not turn a guest selection into an account selection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const COURSE_ID = "11111111-1111-1111-1111-111111111111";
const ASSESSMENT_ID = "22222222-2222-2222-2222-222222222222";

const CN_USER = { id: "c1111111-1111-1111-1111-111111111111", email: "shanghai.user@nonfiction.com", departmentId: "cn-dept" };
const HK_USER = { id: "c2222222-2222-2222-2222-222222222222", email: "hk.user@nonfiction.com", departmentId: "hk-dept" };
const JP_USER = { id: "c3333333-3333-3333-3333-333333333333", email: "ayako.horiguchi@nonfiction.com", departmentId: "jp-dept" };
const KR_USER = { id: "c4444444-4444-4444-4444-444444444444", email: "kr.staff@nonfiction.com", departmentId: "kr-dept" };

const langKey = (userId: string) => `assessment-lang:${userId}:${ASSESSMENT_ID}`;
const anonKey = `assessment-lang:anonymous:${ASSESSMENT_ID}`;

const TITLES = {
  ko: "고객 응대 평가",
  ja: "接客評価",
  yue: "顧客服務評估",
  "zh-CN": "客户服务评估",
  en: "Service Assessment",
};

const h = vi.hoisted(() => {
  const ASSESSMENT_ID = "22222222-2222-2222-2222-222222222222";
  const QUESTION_ID = "33333333-3333-3333-3333-333333333333";

  const state = { user: { id: "", email: "" }, departmentId: "" };

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

  const tables: Record<string, any[]> = {
    departments: [
      { id: "cn-dept", country: "CN", parent_department_id: null },
      { id: "hk-dept", country: "HK", parent_department_id: null },
      { id: "jp-dept", country: "JP", parent_department_id: null },
      { id: "kr-dept", country: "KR", parent_department_id: null },
    ],
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
    assessment_i18n: [
      { assessment_id: ASSESSMENT_ID, language_code: "ja", title: "接客評価", description: null },
      { assessment_id: ASSESSMENT_ID, language_code: "yue", title: "顧客服務評估", description: null },
      { assessment_id: ASSESSMENT_ID, language_code: "zh-CN", title: "客户服务评估", description: null },
      { assessment_id: ASSESSMENT_ID, language_code: "en", title: "Service Assessment", description: null },
    ],
    assessment_question_i18n: [
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
      {
        question_id: QUESTION_ID,
        language_code: "zh-CN",
        question_text: "接待客户的第一步是什么？",
        options: ["倾听", "建议", "成交", "记录"],
        correct_answer: "倾听",
        hint: null,
        explanation: null,
      },
    ],
    assessment_answers: [],
  };

  const makeBuilder = (table: string) => {
    const filters: Array<[string, any]> = [];
    let inserted = false;
    const rows = () => (tables[table] || []).filter((row) => filters.every(([c, v]) => row?.[c] === v));
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
      single: async () => (inserted ? { data: { id: "attempt-1" }, error: null } : { data: rows()[0] ?? null, error: null }),
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
    session: h.state.user.id ? {} : null,
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
const signOut = () => {
  h.state.user = { id: "", email: "" };
  h.state.departmentId = "";
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

const pickLanguage = async (user: ReturnType<typeof userEvent.setup>, optionLabel: string) => {
  await user.click(await screen.findByRole("combobox", { name: "퀴즈 언어 선택" }));
  await user.click(await screen.findByRole("option", { name: optionLabel }));
};

const expectTitle = async (title: string, notTitles: string[]) => {
  expect(await screen.findByText(title)).toBeInTheDocument();
  for (const other of notTitles) expect(screen.queryByText(other)).not.toBeInTheDocument();
};

describe("E2E: shared browser account switching keeps zh-CN / yue choices isolated", () => {
  beforeEach(() => {
    localStorage.clear();
    h.tables.assessment_attempts.length = 0;
    (Element.prototype as any).hasPointerCapture = () => false;
    (Element.prototype as any).setPointerCapture = () => {};
    (Element.prototype as any).releasePointerCapture = () => {};
    (Element.prototype as any).scrollIntoView = () => {};
  });

  it("KR → HK → JP → KR round trip never carries a Chinese/Cantonese choice over", async () => {
    const user = userEvent.setup();

    // Korean staff manually switches the quiz to Simplified Chinese.
    signIn(KR_USER);
    let view = renderPage();
    await expectTitle(TITLES.ko, []);
    await pickLanguage(user, "中文(简体)");
    await waitFor(() => expect(localStorage.getItem(langKey(KR_USER.id))).toBe("zh-CN"));
    await expectTitle(TITLES["zh-CN"], [TITLES.ko]);
    view.unmount();

    // Hong Kong colleague signs in next: must get Cantonese, not zh-CN.
    signIn(HK_USER);
    view = renderPage();
    await expectTitle(TITLES.yue, [TITLES["zh-CN"], TITLES.ko]);
    expect(localStorage.getItem(langKey(HK_USER.id))).toBeNull();
    view.unmount();

    // Japanese colleague signs in next: must get Japanese, not yue/zh-CN.
    signIn(JP_USER);
    view = renderPage();
    await expectTitle(TITLES.ja, [TITLES.yue, TITLES["zh-CN"]]);
    expect(localStorage.getItem(langKey(JP_USER.id))).toBeNull();
    view.unmount();

    // Korean staff comes back: their own zh-CN choice is intact.
    signIn(KR_USER);
    renderPage();
    await expectTitle(TITLES["zh-CN"], [TITLES.ja, TITLES.yue]);
    expect(localStorage.getItem(langKey(KR_USER.id))).toBe("zh-CN");
    expect(localStorage.getItem(langKey(HK_USER.id))).toBeNull();
    expect(localStorage.getItem(langKey(JP_USER.id))).toBeNull();
  });

  it("a Cantonese choice does not reach a mainland (zh-CN) account", async () => {
    const user = userEvent.setup();

    signIn(KR_USER);
    let view = renderPage();
    await pickLanguage(user, "廣東話");
    await waitFor(() => expect(localStorage.getItem(langKey(KR_USER.id))).toBe("yue"));
    await expectTitle(TITLES.yue, [TITLES.ko]);
    view.unmount();

    signIn(CN_USER);
    view = renderPage();
    await expectTitle(TITLES["zh-CN"], [TITLES.yue]);
    expect(localStorage.getItem(langKey(CN_USER.id))).toBeNull();
    expect(localStorage.getItem(langKey(KR_USER.id))).toBe("yue");
  });

  it("a guest (signed-out) selection is not inherited by the next signed-in account", async () => {
    const user = userEvent.setup();

    // Guest on the shared device picks Cantonese: never persisted anywhere.
    signOut();
    let view = renderPage();
    await pickLanguage(user, "廣東話");
    await expectTitle(TITLES.yue, [TITLES.ko]);
    expect(localStorage.getItem(anonKey)).toBeNull();
    view.unmount();

    // Japanese employee signs in on the same browser.
    signIn(JP_USER);
    view = renderPage();
    await expectTitle(TITLES.ja, [TITLES.yue]);
    expect(localStorage.getItem(langKey(JP_USER.id))).toBeNull();
    view.unmount();

    // Signing out again starts from a clean default, not the earlier guest pick.
    signOut();
    renderPage();
    await expectTitle(TITLES.ko, [TITLES.yue, TITLES.ja]);
    expect(localStorage.getItem(anonKey)).toBeNull();
    expect(localStorage.getItem(langKey(JP_USER.id))).toBeNull();
  });
});
