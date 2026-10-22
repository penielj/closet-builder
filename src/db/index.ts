import { ClosetDB } from './schema'

// The app's one database. Tests create their own ClosetDB with a unique name instead.
export const db = new ClosetDB()
