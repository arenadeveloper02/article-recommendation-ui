import { cookies } from 'next/headers'
import {
  ARENA_ACCESS_DENIED_MESSAGE,
  ARENA_EMAIL_COOKIE_NAME,
} from '@/lib/arena-email-constants'

export {
  ARENA_ACCESS_DENIED_MESSAGE,
  ARENA_EMAIL_COOKIE_NAME,
} from '@/lib/arena-email-constants'

/**
 * Reads the Arena email id from the httpOnly cookie (set by middleware from ?emailId=).
 */
export async function getArenaEmailId(): Promise<string | null> {
  const jar = await cookies()
  const value = jar.get(ARENA_EMAIL_COOKIE_NAME)?.value?.trim()
  return value || null
}

/**
 * Returns the Arena email id or throws when missing.
 */
export async function requireArenaEmailId(): Promise<string> {
  const emailId = await getArenaEmailId()
  if (!emailId) {
    throw new Error(ARENA_ACCESS_DENIED_MESSAGE)
  }
  return emailId
}
