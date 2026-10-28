import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import InstallBanner from './components/InstallBanner'
import { db } from './db'
import { ensureSettings } from './db/repo'
import { type Item, SETTINGS_KEY } from './db/schema'
import Closet from './views/Closet'
import Hamper from './views/Hamper'
import ItemForm from './views/ItemForm'
import SettingsView from './views/SettingsView'
import Today from './views/Today'

type View = 'today' | 'closet' | 'hamper' | 'settings'

const TITLES: Record<View, string> = { today: 'Today', closet: 'Closet', hamper: 'Hamper', settings: 'Settings' }

export default function App() {
  const [view, setView] = useState<View>('today')
  const [editing, setEditing] = useState<Item | 'new' | null>(null)
  const [settingsReady, setSettingsReady] = useState(false)
  const items = useLiveQuery(() => db.items.orderBy('createdAt').toArray(), [])
  const settings = useLiveQuery(() => db.settings.get(SETTINGS_KEY), [])
  const inHamper = items?.filter((i) => i.inHamper).length ?? 0

  const [failure, setFailure] = useState<string>()

  useEffect(() => { ensureSettings(db).then(() => setSettingsReady(true)) }, [])

  // A write a button started and nothing caught (hamper, laundry, lock…) shows here
  // instead of failing silently (DESIGN §7 "Writes").
  useEffect(() => {
    const show = (e: PromiseRejectionEvent) => setFailure((e.reason as Error)?.message ?? String(e.reason))
    window.addEventListener('unhandledrejection', show)
    return () => window.removeEventListener('unhandledrejection', show)
  }, [])

  // Nothing renders until the settings row exists: update() on a missing row does
  // nothing and reports no error, so an early write would be lost (DESIGN §8 step 1).
  if (!settingsReady || !settings || !items) return null

  const failureBanner = failure && (
    <p className="banner failure" role="alert">
      <span>That didn't save: {failure}. Close the app and open it again, then try once more.</span>
      <button className="link" onClick={() => setFailure(undefined)}>Dismiss</button>
    </p>
  )

  if (editing) {
    return (
      <>
        {failureBanner}
        <ItemForm item={editing === 'new' ? undefined : editing} items={items} onDone={() => setEditing(null)} />
      </>
    )
  }

  return (
    <div className="app">
      {failureBanner}
      <header className="topbar">
        <h1>{TITLES[view]}</h1>
        <div className="topbar-actions">
          <button
            className={`badge ${view === 'hamper' ? 'active' : ''}`}
            onClick={() => setView(view === 'hamper' ? 'today' : 'hamper')}
            aria-label={`${inHamper} items in the hamper`}
          >
            🧺 {inHamper} in hamper
          </button>
          <button
            className={`badge icon ${view === 'settings' ? 'active' : ''}`}
            onClick={() => setView(view === 'settings' ? 'today' : 'settings')}
            aria-label="Settings"
          >
            ⚙
          </button>
        </div>
      </header>

      <InstallBanner />

      <main>
        {view === 'today' ? <Today items={items} settings={settings} onAdd={() => setEditing('new')} onEdit={setEditing} />
          : view === 'closet' ? <Closet items={items} onAdd={() => setEditing('new')} onEdit={setEditing} />
          : view === 'hamper' ? <Hamper items={items} />
          : <SettingsView settings={settings} itemCount={items.length} />}
      </main>

      <nav className="tabs">
        <button className={view === 'today' ? 'active' : ''} onClick={() => setView('today')}>Today</button>
        <button className={view === 'closet' ? 'active' : ''} onClick={() => setView('closet')}>Closet</button>
      </nav>
    </div>
  )
}
