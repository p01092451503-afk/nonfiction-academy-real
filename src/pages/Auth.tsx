import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail, ArrowRight, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import LanguageToggle from "@/components/LanguageToggle";
import loginBg from "@/assets/login-bg.jpg";

// Preload the image as early as possible
const preloadLink = document.createElement("link");
preloadLink.rel = "preload";
preloadLink.as = "image";
preloadLink.href = loginBg;
document.head.appendChild(preloadLink);

const SAVED_EMAIL_KEY = "nonfiction_saved_email";

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [loginError, setLoginError] = useState<{ type: "invalid" | "not_confirmed" | "no_account" | "too_many" | "generic"; raw?: string } | null>(null);

  useEffect(() => {
    const savedEmail = localStorage.getItem(SAVED_EMAIL_KEY);
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const msg = (error.message || "").toLowerCase();
        let type: "invalid" | "not_confirmed" | "no_account" | "too_many" | "generic" = "generic";
        if (msg.includes("not confirmed") || msg.includes("email not confirmed")) {
          type = "not_confirmed";
        } else if (msg.includes("rate limit") || msg.includes("too many")) {
          type = "too_many";
        } else if (msg.includes("user not found") || msg.includes("no user")) {
          type = "no_account";
        } else if (msg.includes("invalid") || msg.includes("credentials") || msg.includes("password")) {
          type = "invalid";
        }
        setLoginError({ type, raw: error.message });
        return;
      }
      if (rememberMe) {
        localStorage.setItem(SAVED_EMAIL_KEY, email);
      } else {
        localStorage.removeItem(SAVED_EMAIL_KEY);
      }
      navigate("/dashboard");
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left - Visual Panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-white items-center justify-center">
        <img src={loginBg} alt="NONFICTION LMS" className="w-full h-full object-contain" fetchPriority="high" loading="eager" decoding="async" />
      </div>

      {/* Right - Form */}
      <div className="flex-1 flex items-center justify-center px-6 lg:px-16 bg-white relative">
        {/* Language toggle */}
        <div className="absolute top-4 right-4">
          <LanguageToggle />
        </div>

        <div className="w-full max-w-md space-y-10">
          <div className="lg:hidden text-center">
            <h1 className="font-display text-2xl tracking-wider text-foreground">NONFICTION</h1>
          </div>
          <div className="hidden lg:block">
            <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">NONFICTION Education</p>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">{t("auth.login")}</h2>
            <p className="text-sm text-muted-foreground">{t("auth.loginSubtitle")}</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("auth.email")}</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="email" placeholder="name@nonfiction.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 pl-11 bg-white border border-border rounded-xl text-sm placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-foreground/20" required />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("auth.password")}</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type={showPassword ? "text" : "password"} placeholder={t("auth.passwordPlaceholder")} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 pl-11 pr-11 bg-white border border-border rounded-xl text-sm placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-foreground/20" required minLength={6} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded border-border text-foreground focus:ring-foreground/20" />
                <span className="text-sm text-muted-foreground">{t("auth.rememberMe")}</span>
              </label>
              <button type="button" onClick={() => { setShowForgotPassword(true); setResetEmail(email); }} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {t("auth.forgotPassword")}
              </button>
            </div>

            <Button type="submit" variant="login" size="xl" className="w-full" disabled={isLoading}>
              {isLoading ? (
                t("common.processing")
              ) : (
                <span className="flex items-center gap-2">
                  {t("auth.login")}
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </form>

          <div className="text-center">
            <p className="text-xs text-muted-foreground/60">{t("auth.platformFooter")}</p>
          </div>
        </div>
      </div>

      {showForgotPassword && (
        <ForgotPasswordModal
          resetEmail={resetEmail}
          setResetEmail={setResetEmail}
          isResetting={isResetting}
          onClose={() => setShowForgotPassword(false)}
          onSubmit={async () => {
            setIsResetting(true);
            try {
              const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
                redirectTo: `${window.location.origin}/reset-password`,
              });
              if (error) throw error;
              toast({ title: t("auth.emailSent"), description: t("auth.resetLinkSent") });
              setShowForgotPassword(false);
            } catch (error: any) {
              toast({ title: t("common.error"), description: error.message, variant: "destructive" });
            } finally {
              setIsResetting(false);
            }
          }}
        />
      )}

      {loginError && (
        <LoginErrorDialog
          errorType={loginError.type}
          onClose={() => setLoginError(null)}
          onForgotPassword={() => {
            setLoginError(null);
            setResetEmail(email);
            setShowForgotPassword(true);
          }}
        />
      )}
    </div>
  );
};

const LoginErrorDialog = ({
  errorType,
  onClose,
  onForgotPassword,
}: {
  errorType: "invalid" | "not_confirmed" | "no_account" | "too_many" | "generic";
  onClose: () => void;
  onForgotPassword: () => void;
}) => {
  const { t } = useTranslation();
  const descKeyMap = {
    invalid: "auth.loginFailedInvalid",
    not_confirmed: "auth.loginFailedNotConfirmed",
    no_account: "auth.loginFailedNoAccount",
    too_many: "auth.loginFailedTooMany",
    generic: "auth.loginFailedGeneric",
  } as const;
  const showForgot = errorType === "invalid";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 animate-in fade-in" onClick={onClose}>
      <div className="bg-background rounded-2xl p-6 sm:p-8 w-full max-w-md space-y-5 shadow-xl animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <div className="space-y-1.5 flex-1">
            <h3 className="text-lg font-semibold text-foreground">{t("auth.loginFailedTitle")}</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{t(descKeyMap[errorType])}</p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          {showForgot && (
            <Button type="button" variant="outline" className="rounded-full" onClick={onForgotPassword}>
              {t("auth.forgotPassword")}
            </Button>
          )}
          <Button type="button" variant="login" className="rounded-full px-6" onClick={onClose}>
            {t("auth.tryAgain")}
          </Button>
        </div>
      </div>
    </div>
  );
};

const ForgotPasswordModal = ({ resetEmail, setResetEmail, isResetting, onClose, onSubmit }: {
  resetEmail: string; setResetEmail: (v: string) => void; isResetting: boolean; onClose: () => void; onSubmit: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-background rounded-2xl p-8 w-full max-w-sm space-y-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-foreground">{t("auth.forgotPassword")}</h3>
          <p className="text-sm text-muted-foreground">{t("auth.forgotPasswordDesc")}</p>
        </div>
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input type="email" placeholder="name@nonfiction.com" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} className="h-12 pl-11 bg-white border border-border rounded-xl text-sm placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-foreground/20" required />
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="outline" className="flex-1 rounded-full" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="button" variant="login" size="xl" className="flex-1" disabled={isResetting || !resetEmail} onClick={onSubmit}>
            {isResetting ? t("auth.sending") : t("auth.sendResetLink")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Auth;
