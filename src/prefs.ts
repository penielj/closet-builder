// Per-phone conveniences (the cutout checkbox, Mix freely). Storage that's blocked or
// cleared just means the default, so every read and write is allowed to fail.
export const readPref = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
export const writePref = (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* default next time */ } }
