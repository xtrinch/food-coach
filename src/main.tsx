import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import "./index.css";
import { Layout } from "./components/Layout";
import { TodayPage } from "./pages/Today";
import { HistoryPage } from "./pages/History";
import { InsightsPage } from "./pages/Insights";
import { PresetsPage } from "./pages/Presets";
import { SettingsPage } from "./pages/Settings";
import { JobsPage } from "./pages/Jobs";
import { AnalysisJobsProvider } from "./lib/analysisJobs";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter basename="/food-coach">
      <AnalysisJobsProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<TodayPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/presets" element={<PresetsPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Layout>
      </AnalysisJobsProvider>
    </BrowserRouter>
  </React.StrictMode>
);
