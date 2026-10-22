import { useState } from 'react'
import Photo from '../components/Photo'
import { db } from '../db'
import { setInHamper } from '../db/repo'
import type { Item } from '../db/schema'
import { CATEGORIES, CATEGORY_LABELS, type Category } from '../db/values'

interface Props { items: Item[]; onAdd: () => void; onEdit: (item: Item) => void }

export default function Closet({ items, onAdd, onEdit }: Props) {
  const [filter, setFilter] = useState<Category | 'all'>('all')
  const shown = filter === 'all' ? items : items.filter((i) => i.category === filter)

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
            {shown.map((item) => (
              <li key={item.id} className={`card ${item.inHamper ? 'dirty' : ''}`}>
                <button className="card-open" onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`}>
                  <Photo blob={item.photo} color={item.color} alt={item.name} />
                  <span className="card-name">{item.name}</span>
                </button>
                <button className="card-action" onClick={() => setInHamper(db, item.id, !item.inHamper)}>
                  {item.inHamper ? 'Out of hamper' : '→ Hamper'}
                </button>
              </li>
            ))}
          </ul>
        )}

      <button className="fab" onClick={onAdd} aria-label="Add an item">+</button>
    </section>
  )
}
