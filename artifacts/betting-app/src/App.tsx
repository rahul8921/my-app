import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/replit-auth-web";
import { Loader2 } from "lucide-react";

import { Navbar } from "@/components/Navbar";
import Login from "@/pages/Login";
import Matches from "@/pages/Matches";
import MyBets from "@/pages/MyBets";
import Admin from "@/pages/Admin";
import Pending from "@/pages/Pending";
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

function ProtectedRoute({ component: Component, requireApproved = false }: { component: any, requireApproved?: boolean }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Login />;
  
  if (user?.status === 'rejected') return <Pending />;
  if (requireApproved && user?.status === 'pending') return <Pending />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Component />
      </main>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/">
        {() => <ProtectedRoute component={Matches} />}
      </Route>
      <Route path="/matches">
        {() => <ProtectedRoute component={Matches} />}
      </Route>
      <Route path="/my-bets">
        {() => <ProtectedRoute component={MyBets} requireApproved />}
      </Route>
      <Route path="/admin">
        {() => <ProtectedRoute component={Admin} requireApproved />}
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
