import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import i18n from "@/i18n";

// Country code → supported app language. Used to auto-open the right locale
// for users whose branch (department) has a country assigned.
const COUNTRY_TO_LANG: Record<string, "ko" | "en" | "ja" | "zh-CN"> = {
  KR: "ko",
  JP: "ja",
  US: "en",
  HK: "zh-CN",
  CN: "zh-CN",
  TW: "zh-CN",
};

const LANG_MANUAL_KEY = "nfl-lang-manual";
const LANG_MANUAL_AT_KEY = "nfl-lang-manual-at";
const LANG_MANUAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const hasFreshManualLanguageChoice = () => {
  if (typeof localStorage === "undefined") return false;
  if (localStorage.getItem(LANG_MANUAL_KEY) !== "1") return false;
  const changedAt = Number(localStorage.getItem(LANG_MANUAL_AT_KEY) || 0);
  if (changedAt > 0 && Date.now() - changedAt < LANG_MANUAL_TTL_MS) return true;

  // Older builds stored only `nfl-lang-manual=1`, which could permanently trap
  // Japan/China/US users on Korean. Treat that legacy flag as stale and recover.
  localStorage.removeItem(LANG_MANUAL_KEY);
  localStorage.removeItem(LANG_MANUAL_AT_KEY);
  return false;
};

async function applyCountryLanguage(departmentId: string | null | undefined) {
  if (!departmentId) return;
  // Respect explicit user choice: i18next-browser-languagedetector stores it under 'nfl-lang'
  if (hasFreshManualLanguageChoice()) return;
  try {
    const { data } = await supabase
      .from("departments")
      .select("country, parent_department_id")
      .eq("id", departmentId)
      .single();
    let country = data?.country as string | null | undefined;
    // Fall back to parent branch country if team-level dept has none
    if (!country && data?.parent_department_id) {
      const { data: parent } = await supabase
        .from("departments")
        .select("country")
        .eq("id", data.parent_department_id)
        .single();
      country = parent?.country;
    }
    if (!country) return;
    const lang = COUNTRY_TO_LANG[country.toUpperCase()];
    if (lang && i18n.language !== lang) {
      await i18n.changeLanguage(lang);
    }
  } catch (e) {
    console.warn("Auto-language by country failed:", e);
  }
}
import type { User, Session } from "@supabase/supabase-js";

type AppRole = "admin" | "teacher" | "student" | "super_admin";

interface UserProfile {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  department: string | null;
  department_id: string | null;
  position: string | null;
  employee_id: string | null;
  phone_number: string | null;
  team_name: string | null;
  tenant_id: string | null;
}

interface UserContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  roles: AppRole[];
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  session: null,
  profile: null,
  roles: [],
  isLoading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useUser = () => useContext(UserContext);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const sessionIdRef = useRef<string | null>(null);

  // Record login session
  const recordLogin = async (userId: string) => {
    try {
      const { data } = await supabase
        .from("user_sessions")
        .insert({ user_id: userId, login_at: new Date().toISOString() })
        .select("id")
        .single();
      if (data) {
        sessionIdRef.current = data.id;
        // Store in localStorage for tab close / browser close
        localStorage.setItem("current_session_id", data.id);
      }
    } catch (e) {
      console.error("Failed to record login:", e);
    }
  };

  // Record logout
  const recordLogout = async () => {
    const sid = sessionIdRef.current || localStorage.getItem("current_session_id");
    if (!sid) return;
    try {
      await supabase
        .from("user_sessions")
        .update({ logout_at: new Date().toISOString() })
        .eq("id", sid);
      sessionIdRef.current = null;
      localStorage.removeItem("current_session_id");
    } catch (e) {
      console.error("Failed to record logout:", e);
    }
  };

  useEffect(() => {
    // IMPORTANT: Set up listener BEFORE getSession per Supabase best practices.
    // onAuthStateChange fires INITIAL_SESSION first, then getSession resolves.
    // We must NOT set isLoading=false until fetchUserData completes.

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Fire-and-forget: do NOT await inside onAuthStateChange
          if (event === "SIGNED_IN") {
            recordLogin(session.user.id);
          }
          // fetchUserData sets isLoading=false in its finally block
          fetchUserData(session.user.id);
        } else {
          if (event === "SIGNED_OUT") {
            recordLogout();
          }
          setProfile(null);
          setRoles([]);
          setIsLoading(false);
        }
      }
    );

    // Record logout on browser/tab close
    const handleBeforeUnload = () => {
      const sid = sessionIdRef.current || localStorage.getItem("current_session_id");
      if (sid) {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_sessions?id=eq.${sid}`;
        const token = supabase.realtime?.accessToken || "";
        fetch(url, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Authorization": `Bearer ${token}`,
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({ logout_at: new Date().toISOString() }),
          keepalive: true,
        }).catch(() => {});
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  const fetchUserData = async (userId: string) => {
    try {
      const [profileRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).single(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);

      if (profileRes.data) {
        const p = profileRes.data as UserProfile;
        setProfile(p);
        // Auto-switch language based on the user's branch country
        applyCountryLanguage(p.department_id);
      }
      if (rolesRes.data) {
        setRoles(rolesRes.data.map((r: { role: string }) => r.role as AppRole));
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    await recordLogout();
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
  };

  const refreshProfile = async () => {
    if (user) {
      const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
      if (data) setProfile(data as UserProfile);
    }
  };

  return (
    <UserContext.Provider value={{ user, session, profile, roles, isLoading, signOut, refreshProfile }}>
      {children}
    </UserContext.Provider>
  );
};
