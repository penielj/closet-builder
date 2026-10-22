// Fixed tag values, copied exactly from DESIGN §6.8. Every backup file stores these
// strings, so renaming or removing one later needs a backup migration. Adding one doesn't.

export const CATEGORIES = ['top', 'bottom', 'dress', 'shoes', 'outerwear'] as const
export const PATTERNS = ['solid', 'striped', 'checked', 'print'] as const
export const OCCASIONS = ['casual', 'work', 'formal', 'workout'] as const
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const
export const WARMTHS = [1, 2, 3] as const
export const COLOR_MODES = ['auto', 'monochrome', 'tonal', 'complementary'] as const

export type Category = (typeof CATEGORIES)[number]
export type Pattern = (typeof PATTERNS)[number]
export type Occasion = (typeof OCCASIONS)[number]
export type Season = (typeof SEASONS)[number]
export type Warmth = (typeof WARMTHS)[number]
export type ColorMode = (typeof COLOR_MODES)[number]

// The 18 named colors from DESIGN §6.7. `hex` is the swatch shown in the UI and the
// target that auto color snaps to. The picker's hue values are derived from it later.
export const PALETTE = [
  { name: 'black', hex: '#1c1c1c', neutral: true },
  { name: 'white', hex: '#f4f4f2', neutral: true },
  { name: 'grey', hex: '#8e8e8e', neutral: true },
  { name: 'navy', hex: '#1f2a48', neutral: true },
  { name: 'denim', hex: '#4b6a8e', neutral: true },
  { name: 'beige', hex: '#d9c4a3', neutral: true },
  { name: 'brown', hex: '#6b4a2f', neutral: true },
  { name: 'red', hex: '#c0392b', neutral: false },
  { name: 'burgundy', hex: '#7a1f2e', neutral: false },
  { name: 'pink', hex: '#f0a8ba', neutral: false },
  { name: 'orange', hex: '#e67e22', neutral: false },
  { name: 'yellow', hex: '#f1c40f', neutral: false },
  { name: 'olive', hex: '#6b7530', neutral: false },
  { name: 'green', hex: '#2e8b57', neutral: false },
  { name: 'teal', hex: '#1f8a8a', neutral: false },
  { name: 'blue', hex: '#2c5fd6', neutral: false },
  { name: 'light-blue', hex: '#9ec8ec', neutral: false },
  { name: 'purple', hex: '#6c3fa0', neutral: false },
] as const

export type PaletteColor = (typeof PALETTE)[number]['name']
export const COLOR_NAMES = PALETTE.map((c) => c.name) as PaletteColor[]

export const CATEGORY_LABELS: Record<Category, string> = {
  top: 'Tops', bottom: 'Bottoms', dress: 'Dresses', shoes: 'Shoes', outerwear: 'Outerwear',
}
export const WARMTH_LABELS: Record<Warmth, string> = { 1: 'Light', 2: 'Medium', 3: 'Heavy' }
export const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replace('-', ' ')
