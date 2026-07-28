'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { ARENA_ACCESS_DENIED_MESSAGE } from '@/lib/arena-email-constants'

const ArenaEmailContext = createContext<string | null>(null)

interface ArenaEmailProviderProps {
  emailId: string | null
  children: ReactNode
}

/**
 * Provides the Arena iframe emailId to client components.
 */
export function ArenaEmailProvider({ emailId, children }: ArenaEmailProviderProps) {
  return <ArenaEmailContext.Provider value={emailId}>{children}</ArenaEmailContext.Provider>
}

/**
 * Client hook for the Arena email id. Throws when unavailable.
 */
export function useArenaEmailId(): string {
  const emailId = useContext(ArenaEmailContext)
  if (!emailId) {
    throw new Error(ARENA_ACCESS_DENIED_MESSAGE)
  }
  return emailId
}

/**
 * Optional client hook when a page can render without an email id.
 */
export function useOptionalArenaEmailId(): string | null {
  return useContext(ArenaEmailContext)
}
