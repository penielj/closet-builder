import { StoredPhoto } from '../components/Photo'
import { db } from '../db'
import { laundryDone, setInHamper } from '../db/repo'
import type { Item } from '../db/schema'

export default function Hamper({ items }: { items: Item[] }) {
  const dirty = items.filter((i) => i.inHamper)

  if (dirty.length === 0) {
    return <p className="muted empty">The hamper is empty. Everything is clean and can be suggested.</p>
  }

  return (
    <section>
      <p className="muted">Items in the hamper are never suggested.</p>
      <button className="primary" onClick={() => laundryDone(db)}>Laundry done: return all {dirty.length}</button>
      <ul className="list">
        {dirty.map((item) => (
          <li key={item.id} className="row">
            <StoredPhoto itemId={item.id} color={item.color} alt={item.name} />
            <span className="row-name">{item.name}</span>
            <button onClick={() => setInHamper(db, item.id, false)}>Take out</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
