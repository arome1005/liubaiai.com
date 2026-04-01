import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LibraryPage } from "./pages/LibraryPage";
import { BiblePage } from "./pages/BiblePage";
import { EditorPage } from "./pages/EditorPage";
import { SummaryOverviewPage } from "./pages/SummaryOverviewPage";
import { ReferenceLibraryPage } from "./pages/ReferenceLibraryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { TermsPage } from "./pages/TermsPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppShell } from "./components/AppShell";
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
        <Route element={<AppShell />}>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/work/:workId/bible" element={<BiblePage />} />
          <Route path="/work/:workId/summary" element={<SummaryOverviewPage />} />
          <Route path="/work/:workId" element={<EditorPage />} />
          <Route path="/reference" element={<ReferenceLibraryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
