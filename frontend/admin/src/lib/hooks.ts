import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminFetch } from './api'
import { toast } from 'sonner'

export function useAdminQuery<T>(key: string[], path: string, params?: Record<string, string | number>) {
  const qs = params ? '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  ).toString() : ''
  return useQuery<T>({
    queryKey: [...key, params],
    queryFn: () => adminFetch<T>(`${path}${qs}`),
  })
}

export function useAdminMutation<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
  invalidateKeys?: string[][],
) {
  const qc = useQueryClient()
  return useMutation<T, Error, unknown>({
    mutationFn: (body) =>
      adminFetch<T>(path, {
        method,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    onSuccess: () => {
      invalidateKeys?.forEach(k => qc.invalidateQueries({ queryKey: k }))
      toast.success('Saved')
    },
    onError: (err) => toast.error(err.message),
  })
}
