import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { LibraryPage } from "./pages/LibraryPage";
import { LogicPage } from "./pages/LogicPage";
import { InspirationPage } from "./pages/InspirationPage";
import { ChatPage } from "./pages/ChatPage";
import { ShengHuiPage } from "./pages/ShengHuiPage";
import { BiblePage } from "./pages/BiblePage";
import { EditorPage } from "./pages/EditorPage";
import { SummaryOverviewPage } from "./pages/SummaryOverviewPage";
import { ReferenceLibraryPage } from "./pages/ReferenceLibraryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { TermsPage } from "./pages/TermsPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppShell } from "./components/AppShell";
import { EditorShell } from "./components/EditorShell";
import { applyThemePreference, readThemePreference, THEME_KEY } from "./theme";

const FONT_KEY = "liubai:fontSizePx";

export default function App() {
  useEffect(() => {
    const n = Number(localStorage.getItem(FONT_KEY));
    if (!Number.isNaN(n) && n >= 12 && n <= 28) {
      document.documentElement.style.setProperty("--editor-font-size", `${n}px`);
    }
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
      <Routes>
        <Route element={<EditorShell />}>
          <Route path="/work/:workId" element={<EditorPage />} />
        </Route>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/logic" element={<LogicPage />} />
          <Route path="/inspiration" element={<InspirationPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/sheng-hui" element={<ShengHuiPage />} />
          <Route path="/work/:workId/bible" element={<BiblePage />} />
          <Route path="/work/:workId/summary" element={<SummaryOverviewPage />} />
          <Route path="/reference" element={<ReferenceLibraryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
