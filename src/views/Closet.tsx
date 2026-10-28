import { useState } from 'react'
import { StoredPhoto } from '../components/Photo'
import { db } from '../db'
import { localDate } from '../closet/daily'
import { setInHamper, wearToday } from '../db/repo'
import type { Item } from '../db/schema'
import { CATEGORIES, CATEGORY_LABELS, type Category } from '../db/values'

interface Props { items: Item[]; onAdd: () => void; onEdit: (item: Item) => void }

export default function Closet({ items, onAdd, onEdit }: Props) {
  const [filter, setFilter] = useState<Category | 'all'>('all')
  const shown = filter === 'all' ? items : items.filter((i) => i.category === filter)
  const today = localDate()

  return (
    <section>
      <div className="chips" role="tablist" aria-label="Filter by category">
        <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All {items.length}</button>
        {CATEGORIES.map((c) => (
          <button key={c} className={`chip ${filter === c ? 'on' : ''}`} onClick={() => setFilter(c)}>
            {CATEGORY_LABELS[c]} {items.filter((i) => i.category === c).length}
          </button>
        ))}
      </div>

      {shown.length === 0
        ? <p className="muted empty">{items.length === 0 ? 'Nothing here yet.' : `No ${CATEGORY_LABELS[filter as Category].toLowerCase()} yet.`}</p>
        : (
          <ul className="grid">
            {shown.map((item) => {
              const skipped = item.skipDate === today
              return (
                <li key={item.id} className={`card ${item.inHamper || skipped ? 'dirty' : ''}`}>
                  <button className="card-open" onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`}>
                    <StoredPhoto itemId={item.id} color={item.color} alt={item.name} />
                    <span className="card-text">
                      {item.brand && <span className="card-brand">{item.brand}</span>}
                      <span className="card-name">{item.name}</span>
                    </span>
                  </button>
                  {/* Not today is undone here (or on Today's "nothing fits" screen). */}
                  {skipped && !item.inHamper
                    ? <button className="card-action" onClick={() => wearToday(db, item.id)}>Wear today</button>
                    : (
                      <button className="card-action" onClick={() => setInHamper(db, item.id, !item.inHamper)}>
                        {item.inHamper ? 'Out of hamper' : '→ Hamper'}
                      </button>
                    )}
                </li>
              )
            })}
          </ul>
        )}

      <button className="fab" onClick={onAdd} aria-label="Add an item">+</button>
    </section>
  )
}
