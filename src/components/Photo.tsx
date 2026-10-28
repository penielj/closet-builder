import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef } from 'react'
import { db } from '../db'
import type { ItemId } from '../db/schema'
import { PALETTE, type PaletteColor } from '../db/values'
import { cutPhoto, trimPhoto } from '../photo/trim'

// Shows a stored photo Blob through an object URL the app creates itself, revoked when
// the Blob changes or the photo unmounts. Items without a photo show their color swatch.
// `trim` crops the white margin around the garment first. A photo with a cutout `mask` is
// always shown cut out and trimmed, on the page's own background: white, or black in dark
// mode. Without one it keeps its white tile (DESIGN §4 "Look").
export default function Photo({ blob, mask, color, alt, trim = false }: {
  blob?: Blob; mask?: Blob; color: PaletteColor; alt: string; trim?: boolean
}) {
  const ref = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!blob) return
    let live = true
    let url: string | undefined
    ;(mask ? cutPhoto(blob, mask) : trim ? trimPhoto(blob) : Promise.resolve(blob)).then((b) => {
      if (!live || !ref.current) return
      url = URL.createObjectURL(b)
      ref.current.src = url
    })
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [blob, mask, trim])

  return blob
    ? <img ref={ref} className={`photo ${mask ? 'cut' : ''}`} alt={alt} />
    : (
      <div className="photo placeholder" role="img" aria-label={alt}>
        <span className="placeholder-dot" style={{ background: PALETTE.find((c) => c.name === color)!.hex }} />
      </div>
    )
}

// An item's photo, read from the photos table. It only re-reads when that photo changes,
// not when the item goes in or out of the hamper.
export function StoredPhoto({ itemId, color, alt, trim }: { itemId: ItemId; color: PaletteColor; alt: string; trim?: boolean }) {
  const photo = useLiveQuery(async () => (await db.photos.get(itemId)) ?? null, [itemId])
  if (photo === undefined) return <div className="photo placeholder" role="img" aria-label={alt} /> // still loading
  return <Photo blob={photo?.blob} mask={photo?.mask} color={color} alt={alt} trim={trim} />
}
