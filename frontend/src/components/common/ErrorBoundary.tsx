import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error: unknown;
};

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown) {
    console.error('App render error', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-gray-200 rounded-lg p-6 shadow">
            <h1 className="text-lg font-bold text-gray-900">Something went wrong</h1>
            <p className="text-sm text-gray-600 mt-2">Reload the page. If it keeps happening, clear site data and log in again.</p>
            <div className="mt-4 flex gap-3">
              <button
                className="px-4 py-2 rounded bg-blue-600 text-white"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
              <button
                className="px-4 py-2 rounded border border-gray-300"
                onClick={() => {
                  try {
                    localStorage.removeItem('user');
                    localStorage.removeItem('token');
                    localStorage.removeItem('wallet_balance');
                  } catch {
                    void 0;
                  }
                  window.location.href = '/login';
                }}
              >
                Reset session
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

