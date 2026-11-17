import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
const AppShell = lazy(() => import("../components/layout/AppShell").then((module) => ({ default: module.AppShell })));
const LoginPage = lazy(() => import("../features/auth/AuthPages").then((module) => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import("../features/auth/AuthPages").then((module) => ({ default: module.RegisterPage })));
const ForgotPasswordPage = lazy(() => import("../features/auth/AuthPages").then((module) => ({ default: module.ForgotPasswordPage })));
const DashboardPage = lazy(() => import("../features/dashboard/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const ContractsPage = lazy(() => import("../features/contracts/ContractsPage").then((module) => ({ default: module.ContractsPage })));
const ContractDetailPage = lazy(() => import("../features/contracts/ContractsPage").then((module) => ({ default: module.ContractDetailPage })));
const NewContractPage = lazy(() => import("../features/interview/InterviewPages").then((module) => ({ default: module.NewContractPage })));
const InterviewPage = lazy(() => import("../features/interview/InterviewPages").then((module) => ({ default: module.InterviewPage })));
const TemplatesPage = lazy(() => import("../features/templates/TemplatesPage").then((module) => ({ default: module.TemplatesPage })));
const TemplateDetailPage = lazy(() => import("../features/templates/TemplatesPage").then((module) => ({ default: module.TemplateDetailPage })));
const PartiesPage = lazy(() => import("../features/parties/PartiesPage").then((module) => ({ default: module.PartiesPage })));
const PartyDetailPage = lazy(() => import("../features/parties/PartiesPage").then((module) => ({ default: module.PartyDetailPage })));
const ProfilePage = lazy(() => import("../features/profile/ProfilePage").then((module) => ({ default: module.ProfilePage })));
const OnboardingPage = lazy(() => import("../features/profile/ProfilePage").then((module) => ({ default: module.OnboardingPage })));
const SettingsPage = lazy(() => import("../features/profile/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const BillingPage = lazy(() => import("../features/billing/BillingPage").then((module) => ({ default: module.BillingPage })));
const SignaturePage = lazy(() => import("../features/signatures/SignaturePage").then((module) => ({ default: module.SignaturePage })));
const FinancePage = lazy(() => import("../features/finance/FinancePages").then((module) => ({ default: module.FinancePage })));
const ReceiptsPage = lazy(() => import("../features/finance/FinancePages").then((module) => ({ default: module.ReceiptsPage })));
const NotificationsPage = lazy(() => import("../features/notifications/NotificationsPage").then((module) => ({ default: module.NotificationsPage })));
const TermsPage = lazy(() => import("../features/legal/LegalPages").then((module) => ({ default: module.TermsPage })));
const PrivacyPage = lazy(() => import("../features/legal/LegalPages").then((module) => ({ default: module.PrivacyPage })));

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="screen-state" role="status">Carregando sua sessão…</div>;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Suspense fallback={<div className="screen-state" role="status">Carregando…</div>}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/onboarding" element={<Protected><OnboardingPage /></Protected>} />
      <Route path="/public/sign/:token" element={<SignaturePage />} />
      <Route
        path="/app"
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="new-contract" element={<NewContractPage />} />
        <Route path="interview/:sessionId" element={<InterviewPage />} />
        <Route path="contracts" element={<ContractsPage />} />
        <Route path="contracts/:contractId" element={<ContractDetailPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="templates/:templateId" element={<TemplateDetailPage />} />
        <Route path="parties" element={<PartiesPage />} />
        <Route path="parties/:partyId" element={<PartyDetailPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="receipts" element={<ReceiptsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
    </Suspense>
  );
}
