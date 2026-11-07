import { Component, type ReactNode } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { AlertTriangle, Compass } from 'lucide-react';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/Modal';
import { DataProvider, useData } from './store/DataContext';
import { Layout } from './components/Layout';
import { Empty, Loading } from './components/ui';
import { Dashboard } from './pages/Dashboard';
import { Analytics } from './pages/Analytics';
import { Transactions } from './pages/Transactions';
import { Budgets } from './pages/Budgets';
import { Income } from './pages/Income';
import { Bills } from './pages/Bills';
import { Goals } from './pages/Goals';
import { Debts } from './pages/Debts';
import { Calendar } from './pages/Calendar';
import { NetWorth } from './pages/NetWorth';
import { Preferences, Profile } from './pages/Settings';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ maxWidth: 520, margin: '12vh auto', padding: 16 }} className="card">
          <Empty icon={AlertTriangle} title="Something went wrong" text={this.state.error.message}
            action={<button className="btn btn-primary" onClick={() => location.reload()}>Reload Vault</button>} />
        </div>
      );
    }
    return this.props.children;
  }
}

function Gate() {
  const { state, loading, error, reload } = useData();
  if (loading && !state) return <div className="main" style={{ maxWidth: 1400, margin: '0 auto' }}><Loading /></div>;
  if (error && !state) {
    return (
      <div style={{ maxWidth: 520, margin: '12vh auto', padding: 16 }} className="card">
        <Empty icon={AlertTriangle} title="Couldn't load your data" text={error} action={<button className="btn btn-primary" onClick={reload}>Try again</button>} />
      </div>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="budgets" element={<Budgets />} />
        <Route path="income" element={<Income />} />
        <Route path="bills" element={<Bills />} />
        <Route path="goals" element={<Goals />} />
        <Route path="debts" element={<Debts />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="net-worth" element={<NetWorth />} />
        <Route path="profile" element={<Profile />} />
        <Route path="preferences" element={<Preferences />} />
        <Route path="*" element={<div className="card"><Empty icon={Compass} title="Page not found" action={<Link to="/" className="btn btn-primary">Back to dashboard</Link>} /></div>} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmProvider>
          <DataProvider>
            <Gate />
          </DataProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
