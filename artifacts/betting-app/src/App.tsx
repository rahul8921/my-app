import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

import { Navbar } from "@/components/Navbar";
import Login from "@/pages/Login";
import Matches from "@/pages/Matches";
import MyBets from "@/pages/MyBets";
import Admin from "@/pages/Admin";
import Leaderboard from "@/pages/Leaderboard";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center">
      <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
      <p className="text-muted-foreground font-medium animate-pulse">Loading BetZone...</p>
    </div>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}

function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  const { isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  return <AppShell><Component /></AppShell>;
}

function RequiresLoginRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) { window.location.href = "/login"; return null; }
  return <AppShell><Component /></AppShell>;
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Login />;
  if (!user?.isAdmin) {
    return (
      <AppShell>
        <div className="p-16 text-center text-red-400 font-semibold">Access Denied</div>
      </AppShell>
    );
  }
  return <AppShell><Component /></AppShell>;
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        {() => <PublicRoute component={Matches} />}
      </Route>
      <Route path="/matches">
        {() => <PublicRoute component={Matches} />}
      </Route>
      <Route path="/leaderboard">
        {() => <PublicRoute component={Leaderboard} />}
      </Route>
      <Route path="/login">
        {() => <Login />}
      </Route>
      <Route path="/my-bets">
        {() => <RequiresLoginRoute component={MyBets} />}
      </Route>
      <Route path="/admin">
        {() => <AdminRoute component={Admin} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
