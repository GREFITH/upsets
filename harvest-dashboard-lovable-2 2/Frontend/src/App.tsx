import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import DashboardLayout from "./components/DashboardLayout";
import OverviewDashboard from "./pages/OverviewDashboard";
import DepartmentDashboard from "./pages/DepartmentDashboard";
import FreelancerAssignments from "./pages/FreelancerAssignments";
import EmployeeData from "./pages/EmployeeData";
import SalesDashboard from "./pages/SalesDashboard";
import SalesPipeline from "./pages/SalesPipeline";
import ProjectEstimator from "./pages/ProjectEstimator";
import ClientRegistry from "./pages/ClientRegistry";
import ClientDetail from "./pages/ClientDetail";
import HarvestSettings from "./pages/HarvestSettings";
import LoginPage, { isAuthenticated } from "./pages/LoginPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Default cache: avoid refetching every dashboard endpoint on each route mount or window focus;
// Harvest-backed queries are invalidated explicitly after a successful sync.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <DateRangeProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAuth><Index /></RequireAuth>} />
          <Route path="/dashboard" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
            <Route index element={<OverviewDashboard />} />
            <Route path="freelancers" element={<FreelancerAssignments />} />
            <Route path="employees" element={<EmployeeData />} />
            <Route path="clients" element={<ClientRegistry />} />
            <Route path="clients/:clientNumber" element={<ClientDetail />} />
            <Route path="settings" element={<HarvestSettings />} />
            <Route path=":departmentId" element={<DepartmentDashboard />} />
          </Route>
          <Route path="/sales" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
            <Route index element={<SalesDashboard />} />
            <Route path="pipeline" element={<SalesPipeline />} />
            <Route path="estimator" element={<ProjectEstimator />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </DateRangeProvider>
  </QueryClientProvider>
);

export default App;
