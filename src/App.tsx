import { useEffect } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { LibraryPage } from "./pages/LibraryPage";
import { LogicPage as _LogicPageDeprecated } from "./pages/LogicPage"; // @deprecated — replaced by V0TuiyanPage at /logic
import { InspirationPage } from "./pages/InspirationPage";
import { ChatPage } from "./pages/ChatPage";
import { ShengHuiPage } from "./pages/ShengHuiPage";
import { BiblePage } from "./pages/BiblePage";
import { LuobiHubPage } from "./pages/LuobiHubPage";
import { LuobiGeneratorPage } from "./pages/LuobiGeneratorPage";
import { PromptsPage } from "./pages/PromptsPage";
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
import { AppShell } from "./components/AppShell";
import { EditorShell } from "./components/EditorShell";
import { applyThemePreference, readThemePreference, THEME_KEY } from "./theme";
import { applyEditorTypographyCssVars, loadEditorTypography } from "./util/editor-typography";
import { useAuthUserState } from "./hooks/useAuthUserState";

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
    <ErrorBoundary>
      <Toaster position="top-center" richColors />
      <FirstAiGateHost />
      <InspirationGlobalCapture />
      <RegisterDemoPackEffect />
      <Routes>
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
            <Route path="/logic" element={<V0TuiyanPage />} />
            <Route path="/v0/tuiyan" element={<Navigate to="/logic" replace />} />
            <Route path="/v0/test" element={<V0TestPage />} />
            <Route path="/inspiration" element={<InspirationPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/sheng-hui" element={<ShengHuiPage />} />
            <Route path="/luobi" element={<LuobiHubPage />} />
            <Route path="/luobi/generate/:mode" element={<LuobiGeneratorPage />} />
            <Route path="/prompts" element={<PromptsPage />} />
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
  );
}
