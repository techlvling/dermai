import { useAdminQuery, useAdminMutation } from '@/lib/hooks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Database } from 'lucide-react'

interface EvidenceStatus {
  last_refreshed: string | null
  ingredient_count: number
  status: string
}

export default function EvidencePage() {
  const { data, isLoading, refetch } = useAdminQuery<EvidenceStatus>(['evidence'], '/evidence')
  const refreshMut = useAdminMutation('/evidence/refresh', 'POST', [['evidence']])

  async function handleRefresh() {
    await refreshMut.mutateAsync(undefined)
    refetch()
  }

  const ageMs = data?.last_refreshed ? Date.now() - new Date(data.last_refreshed).getTime() : null
  const ageDays = ageMs !== null ? Math.round(ageMs / 86400000) : null
  const isStale = ageDays !== null && ageDays >= 8

  return (
    <div className="p-6 space-y-6 max-w-xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Evidence Cache</h1>
        <Button onClick={handleRefresh} disabled={refreshMut.isPending} size="sm">
          <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshMut.isPending ? 'animate-spin' : ''}`} />
          {refreshMut.isPending ? 'Refreshing…' : 'Refresh Now'}
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-40" /> : (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Database className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Cache Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={data?.status === 'ok' ? 'secondary' : 'destructive'}>{data?.status ?? 'unknown'}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Last refreshed</span>
              <span className={isStale ? 'text-destructive font-medium' : ''}>
                {data?.last_refreshed ? new Date(data.last_refreshed).toLocaleString() : '—'}
                {ageDays !== null && ` (${ageDays}d ago)`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ingredient count</span>
              <span>{data?.ingredient_count ?? 0}</span>
            </div>
            {isStale && (
              <p className="text-xs text-destructive border border-destructive/20 rounded p-2 bg-destructive/5">
                Cache is over a week old. The weekly cron may have failed — click Refresh Now to update it manually.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        The evidence cache is normally refreshed weekly (Sunday 06:00 UTC) by Vercel's cron job at{' '}
        <code className="bg-muted px-1 rounded">/api/cron/refresh-evidence</code>.
        Use Refresh Now to trigger an immediate update.
      </p>
    </div>
  )
}
