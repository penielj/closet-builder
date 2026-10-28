import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef } from 'react'
import { db } from '../db'
import type { ItemId } from '../db/schema'
import { PALETTE, type PaletteColor } from '../db/values'

// Shows a stored photo Blob through an object URL the app creates itself, revoked when
// the Blob changes or the photo unmounts. Items without a photo show their color swatch.
export default function Photo({ blob, color, alt }: { blob?: Blob; color: PaletteColor; alt: string }) {
  const ref = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!blob || !ref.current) return
    const url = URL.createObjectURL(blob)
    ref.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [blob])

  return blob
    ? <img ref={ref} className="photo" alt={alt} />
    : (
      <div className="photo placeholder" role="img" aria-label={alt}>
        <span className="placeholder-dot" style={{ background: PALETTE.find((c) => c.name === color)!.hex }} />
      </div>
    )
}

// An item's photo, read from the photos table. It only re-reads when that photo changes,
// not when the item goes in or out of the hamper.
export function StoredPhoto({ itemId, color, alt }: { itemId: ItemId; color: PaletteColor; alt: string }) {
  const photo = useLiveQuery(async () => (await db.photos.get(itemId)) ?? null, [itemId])
  if (photo === undefined) return <div className="photo placeholder" role="img" aria-label={alt} /> // still loading
  return <Photo blob={photo?.blob} color={color} alt={alt} />
}
