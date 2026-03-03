import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null, key: 0 };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error, info);
  }

  handleRetry = () => {
    this.setState((prev) => ({ error: null, key: prev.key + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-950 text-gray-100">
          <h2 className="text-xl font-semibold text-red-400 mb-2">Произошла ошибка</h2>
          <p className="text-gray-400 mb-4 text-center max-w-md">{this.state.error?.message || 'Неизвестная ошибка'}</p>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 rounded-xl bg-blue-500/30 text-blue-300 border border-blue-500/50 hover:bg-blue-500/40"
          >
            Попробовать снова
          </button>
        </div>
      );
    }
    return <div key={this.state.key}>{this.props.children}</div>;
  }
}
