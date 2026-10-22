import { MINIMUM, closetReadiness } from '../closet/readiness'
import type { Item } from '../db/schema'

interface Props { items: Item[]; onAdd: () => void; onOpenCloset: () => void }

export default function Today({ items, onAdd, onOpenCloset }: Props) {
  const { ready, have, missing } = closetReadiness(items)

  if (!ready) {
    return (
      <section className="panel">
        {items.length === 0 && (
          <>
            <h2>Welcome</h2>
            <p>Add the ~20 things you actually wear. You can add the rest later.</p>
          </>
        )}
        <h3>What the picker needs</h3>
        <Meter label="Tops (or dresses)" have={have.tops} need={MINIMUM.tops} />
        <Meter label="Bottoms (or dresses)" have={have.bottoms} need={MINIMUM.bottoms} />
        <Meter label="Shoes" have={have.shoes} need={MINIMUM.shoes} />
        <p className="muted">Still missing: {missing.join(', ')}.</p>
        <button className="primary" onClick={onAdd}>Add an item</button>
      </section>
    )
  }

  // The outfit picker is build order step 3 (DESIGN §7).
  return (
    <section className="panel">
      <h2>Your closet is ready</h2>
      <p>{items.length} items cataloged. Daily outfits arrive in a later build.</p>
      <button onClick={onOpenCloset}>Open closet</button>
    </section>
  )
}

function Meter({ label, have, need }: { label: string; have: number; need: number }) {
  const done = have >= need
  return (
    <div className="meter">
      <div className="meter-row">
        <span>{label}</span>
        <span className={done ? 'ok' : ''}>{Math.min(have, need)}/{need}{done ? ' ✓' : ''}</span>
      </div>
      <div className="meter-track"><div className="meter-fill" style={{ width: `${Math.min(1, have / need) * 100}%` }} /></div>
    </div>
  )
}
