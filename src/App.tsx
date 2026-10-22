import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from './db'
import { ensureSettings } from './db/repo'
import type { Item } from './db/schema'
import Closet from './views/Closet'
import Hamper from './views/Hamper'
import ItemForm from './views/ItemForm'
import Today from './views/Today'

type View = 'today' | 'closet' | 'hamper'

export default function App() {
  const [view, setView] = useState<View>('today')
  const [editing, setEditing] = useState<Item | 'new' | null>(null)
  const items = useLiveQuery(() => db.items.orderBy('createdAt').toArray(), [])
  const inHamper = items?.filter((i) => i.inHamper).length ?? 0

  useEffect(() => { ensureSettings(db) }, [])

  if (editing) {
    return <ItemForm item={editing === 'new' ? undefined : editing} items={items ?? []} onDone={() => setEditing(null)} />
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>{view === 'hamper' ? 'Hamper' : view === 'closet' ? 'Closet' : 'Today'}</h1>
        <button
          className={`badge ${view === 'hamper' ? 'active' : ''}`}
          onClick={() => setView(view === 'hamper' ? 'today' : 'hamper')}
          aria-label={`${inHamper} items in the hamper`}
        >
          🧺 {inHamper} in hamper
        </button>
      </header>

      <main>
        {items === undefined ? null
          : view === 'today' ? <Today items={items} onAdd={() => setEditing('new')} onOpenCloset={() => setView('closet')} />
          : view === 'closet' ? <Closet items={items} onAdd={() => setEditing('new')} onEdit={setEditing} />
          : <Hamper items={items} />}
      </main>

      <nav className="tabs">
        <button className={view === 'today' ? 'active' : ''} onClick={() => setView('today')}>Today</button>
        <button className={view === 'closet' ? 'active' : ''} onClick={() => setView('closet')}>Closet</button>
      </nav>
    </div>
  )
}
