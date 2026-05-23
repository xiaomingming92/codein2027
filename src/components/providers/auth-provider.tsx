"use client"

import * as React from "react"
import { useAuthStore } from "@/stores"

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const setLoading = useAuthStore((s) => s.setLoading)

  React.useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setLoading(false)
      return
    }

    const unsubFinishHydration = useAuthStore.persist.onFinishHydration(() => {
      setLoading(false)
    })

    return unsubFinishHydration
  }, [setLoading])

  return <>{children}</>
}
