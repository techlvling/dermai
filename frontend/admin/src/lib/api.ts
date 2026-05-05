import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://kqinywnsotyssdciciuf.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxaW55d25zb3R5c3NkY2ljaXVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzg5NTksImV4cCI6MjA5Mjk1NDk1OX0.vG8fTQW5KuZBb0QNjfz-LymVwVmn_Z3sXX6iRdMKc_w'

// Reuse the same storageKey as the main app so the session is shared
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, storageKey: 'tinkskin-auth' },
})

export async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function adminFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = await getAuthHeader()
  const res = await fetch(`/api/admin${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...headers, ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}
