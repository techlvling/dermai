import { useAdminQuery } from '@/lib/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { downloadCsv } from '@/lib/csv'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

interface AuditEntry {
  id: number
  ts: string
  admin_email: string
  action: string
  resource_type: string | null
  resource_id: string | null
  payload: unknown
}
interface AuditResponse { items: AuditEntry[] }

const ACTION_VARIANT: Record<string, 'destructive' | 'secondary' | 'default'> = {
  delete:      'destructive',
  delete_user: 'destructive',
  create:      'default',
  update:      'secondary',
}

export default function AuditPage() {
  const { data, isLoading } = useAdminQuery<AuditResponse>(['audit'], '/audit')

  function exportCsv() {
    const rows = (data?.items ?? []).map(e => ({
      ts:            e.ts,
      admin_email:   e.admin_email,
      action:        e.action,
      resource_type: e.resource_type ?? '',
      resource_id:   e.resource_id ?? '',
    }))
    downloadCsv('admin-audit-log.csv', rows)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Audit Log</h1>
          <p className="text-sm text-muted-foreground">Last 200 admin write actions.</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data?.items.length}>
          Export CSV
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).map(e => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(e.ts).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm">{e.admin_email}</TableCell>
                  <TableCell>
                    <Badge variant={ACTION_VARIANT[e.action] ?? 'outline'}>{e.action}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.resource_type ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{e.resource_id ?? '—'}</TableCell>
                </TableRow>
              ))}
              {(data?.items ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                    No audit entries yet — admin writes will appear here.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
