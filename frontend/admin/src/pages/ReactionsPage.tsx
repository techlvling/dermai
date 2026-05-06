import { useState } from 'react'
import { useAdminQuery } from '@/lib/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { downloadCsv } from '@/lib/csv'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

interface Reaction {
  id: string
  user_id: string
  product_id: string
  severity: number
  notes: string | null
  created_at: string
}
interface ReactionsResponse { reactions: Reaction[]; total: number }

function severityBadge(s: number) {
  if (s >= 4) return <Badge variant="destructive">Severity {s}</Badge>
  if (s >= 3) return <Badge variant="secondary">Severity {s}</Badge>
  return <Badge variant="outline">Severity {s}</Badge>
}

export default function ReactionsPage() {
  const [severityMin, setSeverityMin] = useState<string>('4')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useAdminQuery<ReactionsResponse>(
    ['reactions'],
    '/reactions',
    { severity_min: severityMin, page, limit: 50 },
  )

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Reactions Safety Queue</h1>
          <p className="text-sm text-muted-foreground">Monitor adverse reactions logged by users.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{data?.total ?? 0} records</span>
          <Button variant="outline" size="sm" disabled={!data?.reactions.length}
            onClick={() => downloadCsv('reactions.csv', (data?.reactions ?? []).map(r => ({
              id: r.id, user_id: r.user_id, product_id: r.product_id,
              severity: r.severity, notes: r.notes ?? '', created_at: r.created_at,
            })))}>
            Export CSV
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Severity min:</span>
        <Select value={severityMin} onValueChange={(v) => { setSeverityMin(v ?? '1'); setPage(1) }}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['1','2','3','4','5'].map(v => <SelectItem key={v} value={v}>{v}+</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.reactions ?? []).map(r => (
                <TableRow key={r.id} className={r.severity >= 4 ? 'bg-destructive/5' : ''}>
                  <TableCell>{severityBadge(r.severity)}</TableCell>
                  <TableCell className="font-medium text-sm">{r.product_id}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{(r.user_id ?? '—').slice(0, 8)}…</TableCell>
                  <TableCell className="text-sm max-w-xs truncate">{r.notes ?? '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {(data?.reactions ?? []).length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No reactions at this severity level.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={(data?.reactions.length ?? 0) < 50} onClick={() => setPage(p => p + 1)}>Next</Button>
      </div>
    </div>
  )
}
