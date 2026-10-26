import { useState, useEffect } from 'react';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { CommandCenterPage } from './pages/CommandCenterPage';
import {
  ProblemPage,
  FeaturesPage,
  DemoPage,
  DocsPage,
  PrivacyPage,
  TermsPage,
  type PublicRoute,
} from './pages/PublicPages';

type Route = 'home' | 'login' | 'command' | PublicRoute;

function getRouteFromLocation(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  const path = window.location.pathname.replace(/^\//, '').toLowerCase();
  const candidate = hash || path;

  if (candidate === 'problem') return 'problem';
  if (candidate === 'features') return 'features';
  if (candidate === 'demo') return 'demo';
  if (candidate === 'docs') return 'docs';
  if (candidate === 'privacy') return 'privacy';
  if (candidate === 'terms') return 'terms';
  if (candidate === 'login') return 'login';
  if (candidate === 'command') return 'command';
  return sessionStorage.getItem('satark-session') ? 'command' : 'home';
}

export default function App() {
  const [route, setRoute] = useState<Route>(getRouteFromLocation);
  const hasSession = !!sessionStorage.getItem('satark-session');

  useEffect(() => {
    const onHash = () => setRoute(getRouteFromLocation());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigateTo = (r: Route) => {
    setRoute(r);
    window.location.hash = r === 'home' ? '' : `/${r}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goLogin = () => navigateTo(hasSession ? 'command' : 'login');

  const pubProps = {
    onHome: () => navigateTo('home'),
    onLogin: goLogin,
    onNavigate: (r: PublicRoute) => navigateTo(r),
    hasSession,
  };

  if (route === 'command' && !hasSession) {
    return <LoginPage onLogin={() => navigateTo('command')} onHome={() => navigateTo('home')} onNavigate={(r) => navigateTo(r)} />;
  }
  if (route === 'login') {
    return <LoginPage onLogin={() => navigateTo('command')} onHome={() => navigateTo('home')} onNavigate={(r) => navigateTo(r)} />;
  }
  if (route === 'command') {
    return (
      <CommandCenterPage
        onLogout={() => {
          sessionStorage.removeItem('satark-session');
          navigateTo('login');
        }}
      />
    );
  }
  if (route === 'problem') return <ProblemPage {...pubProps} />;
  if (route === 'features') return <FeaturesPage {...pubProps} />;
  if (route === 'demo') return <DemoPage {...pubProps} />;
  if (route === 'docs') return <DocsPage {...pubProps} />;
  if (route === 'privacy') return <PrivacyPage {...pubProps} />;
  if (route === 'terms') return <TermsPage {...pubProps} />;

  return (
    <HomePage
      onEnter={goLogin}
      hasSession={hasSession}
      onNavigate={(r) => navigateTo(r)}
    />
  );
}
