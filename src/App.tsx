import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { LibraryPage } from "./pages/LibraryPage";
import { InspirationPage } from "./pages/InspirationPage";
import { ChatPage } from "./pages/ChatPage";
import { ShengHuiPage } from "./pages/ShengHuiPage";
import { BiblePage } from "./pages/BiblePage";
import { LuobiHubPage } from "./pages/LuobiHubPage";
import { LuobiGeneratorPage } from "./pages/LuobiGeneratorPage";
import { PromptsPage } from "./pages/PromptsPage";
import { PromptFormPage } from "./pages/PromptFormPage";
import { EditorPage } from "./pages/EditorPage";
import { ReshapePage } from "./pages/ReshapePage";
import { SummaryOverviewPage } from "./pages/SummaryOverviewPage";
import { ReferenceLibraryPage } from "./pages/ReferenceLibraryPage";
import { SettingsPage } from "./pages/SettingsPage";
import V0TuiyanPage from "./pages/V0TuiyanPage";
import V0TestPage from "./pages/V0TestPage";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { TermsPage } from "./pages/TermsPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FirstAiGateHost } from "./components/FirstAiGateHost";
import { InspirationGlobalCapture } from "./components/InspirationGlobalCapture";
import { RegisterDemoPackEffect } from "./components/RegisterDemoPackEffect";
import { OwnerSidecarBadge } from "./components/OwnerSidecarBadge";
import { AppShell } from "./components/AppShell";
import { EditorShell } from "./components/EditorShell";
import { applyThemePreference, readThemePreference, THEME_KEY } from "./theme";
import { ImperativeDialogProvider } from "./components/ImperativeDialog";
import { applyEditorTypographyCssVars, loadEditorTypography } from "./util/editor-typography";
import { useAuthUserState } from "./hooks/useAuthUserState";
import { useAiUsageAccountSync } from "./hooks/useAiUsageAccountSync";
import { AppSplash } from "./components/AppSplash";

const FONT_KEY = "liubai:fontSizePx";

function FullscreenLoading() {
  return (
    <div className="page">
      <div className="rounded-xl border border-border/40 bg-card/30 px-4 py-8 text-center shadow-sm sm:px-6">
        <p className="muted">加载中…</p>
      </div>
    </div>
  );
}

function RequireAuth(props: { authUser: unknown }) {
  if (props.authUser === undefined) return <FullscreenLoading />;
  if (!props.authUser) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export default function App() {
  const { authUser } = useAuthUserState();
  useAiUsageAccountSync(authUser?.id);

  // Global splash: show while auth is resolving, minimum 1.5s display
  const [splashPhase, setSplashPhase] = useState<"show" | "fading" | "done">("show");
  const minElapsedRef = useRef(false);
  const authResolvedRef = useRef(false);

  const tryFade = useCallback(() => {
    if (minElapsedRef.current && authResolvedRef.current) {
      setSplashPhase("fading");
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      minElapsedRef.current = true;
      tryFade();
    }, 1500);
    return () => clearTimeout(t);
  }, [tryFade]);

  useEffect(() => {
    if (authUser !== undefined) {
      authResolvedRef.current = true;
      tryFade();
    }
  }, [authUser, tryFade]);

  useEffect(() => {
    if (splashPhase !== "fading") return;
    const t = window.setTimeout(() => setSplashPhase("done"), 580);
    return () => clearTimeout(t);
  }, [splashPhase]);

  useEffect(() => {
    const n = Number(localStorage.getItem(FONT_KEY));
    if (!Number.isNaN(n) && n >= 12 && n <= 28) {
      document.documentElement.style.setProperty("--editor-font-size", `${n}px`);
    }
    applyEditorTypographyCssVars(loadEditorTypography());
    applyThemePreference(readThemePreference());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemSchemeChange = () => {
      try {
        if (localStorage.getItem(THEME_KEY) === "system") {
          applyThemePreference("system");
        }
      } catch {
        /* ignore */
      }
    };
    mq.addEventListener("change", onSystemSchemeChange);
    return () => mq.removeEventListener("change", onSystemSchemeChange);
  }, []);

  return (
    <ImperativeDialogProvider>
      <ErrorBoundary>
        {splashPhase !== "done" && <AppSplash fading={splashPhase === "fading"} />}
      <Toaster position="top-center" richColors />
      <FirstAiGateHost />
      <InspirationGlobalCapture />
      <RegisterDemoPackEffect />
      <OwnerSidecarBadge />
      <Routes>
        <Route element={<RequireAuth authUser={authUser} />}>
          <Route path="/logic" element={<V0TuiyanPage />} />
          <Route path="/v0/tuiyan" element={<Navigate to="/logic" replace />} />
          <Route path="/sheng-hui" element={<ShengHuiPage />} />
        </Route>
        <Route element={<EditorShell />}>
          <Route path="/work/:workId" element={<EditorPage />} />
          <Route path="/work/:workId/reshape" element={<ReshapePage />} />
        </Route>
        <Route element={<AppShell />}>
          <Route
            path="/"
            element={
              authUser === undefined ? (
                <FullscreenLoading />
              ) : authUser ? (
                <Navigate to="/library" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

          {/* 未登录默认进入登录/注册页；业务页需先登录 */}
          <Route element={<RequireAuth authUser={authUser} />}>
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/v0/test" element={<V0TestPage />} />
            <Route path="/inspiration" element={<InspirationPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/luobi" element={<LuobiHubPage />} />
            <Route path="/luobi/generate/:mode" element={<LuobiGeneratorPage />} />
            <Route path="/prompts" element={<PromptsPage />} />
            <Route path="/prompts/new" element={<PromptFormPage />} />
            <Route path="/prompts/:id/edit" element={<PromptFormPage />} />
            <Route path="/work/:workId/bible" element={<BiblePage />} />
            <Route path="/work/:workId/summary" element={<SummaryOverviewPage />} />
            <Route path="/reference" element={<ReferenceLibraryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route
            path="*"
            element={
              authUser === undefined ? (
                <Navigate to="/login" replace />
              ) : authUser ? (
                <Navigate to="/library" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
        </Route>
      </Routes>
      </ErrorBoundary>
    </ImperativeDialogProvider>
  );
}
