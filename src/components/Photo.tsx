import { useEffect, useRef } from 'react'
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
