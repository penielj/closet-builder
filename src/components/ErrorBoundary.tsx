import { Component, type ReactNode } from 'react'

// If the app crashes while drawing, show what broke instead of a blank screen. "Refresh
// app files" clears only the offline copy of the app; the closet's database is untouched.
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="crash" role="alert">
        <p className="crash-title">Something went wrong.</p>
        <p className="muted">Your closet is safe. Try again, and if that doesn't help, refresh the app files. If it keeps happening, send a screenshot of this.</p>
        <pre className="crash-detail">{`${error.message}\n${(error.stack ?? '').split('\n').slice(0, 6).join('\n')}`}</pre>
        <div className="row-buttons">
          <button onClick={() => location.reload()}>Try again</button>
          <button onClick={refreshAppFiles}>Refresh app files</button>
        </div>
      </div>
    )
  }
}

async function refreshAppFiles() {
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations()
    await Promise.all((registrations ?? []).map((r) => r.unregister()))
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k.startsWith('closet-')).map((k) => caches.delete(k)))
  } finally {
    location.reload()
  }
}
