import { useState } from 'react'
import { useAdminQuery, useAdminMutation } from '@/lib/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { downloadCsv } from '@/lib/csv'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

interface Scan {
  id: number
  user_id: string
  created_at: string
  image_urls: string[] | null
}
interface ScansResponse { scans: Scan[]; total: number }

export default function ScansPage() {
  const [page, setPage] = useState(1)
  const [userId, setUserId] = useState('')
  const [viewing, setViewing] = useState<Scan | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const { data, isLoading } = useAdminQuery<ScansResponse>(
    ['scans'],
    '/scans',
    { page, limit: 50, ...(userId ? { user_id: userId } : {}) },
  )
  const deleteMutation = useAdminMutation(`/scans/${confirmDelete}`, 'DELETE', [['scans']])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Scans</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{data?.total ?? 0} total</span>
          <Button variant="outline" size="sm" disabled={!data?.scans.length}
            onClick={() => downloadCsv('scans.csv', (data?.scans ?? []).map(s => ({
              id: s.id, user_id: s.user_id, created_at: s.created_at,
              image_count: (s.image_urls ?? []).length,
            })))}>
            Export CSV
          </Button>
        </div>
      </div>

      <Input
        placeholder="Filter by user ID…"
        value={userId}
        onChange={e => { setUserId(e.target.value); setPage(1) }}
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thumbnail</TableHead>
                <TableHead>Scan ID</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.scans ?? []).map(s => (
                <TableRow key={s.id}>
                  <TableCell>
                    {s.image_urls?.[0] ? (
                      <img
                        src={s.image_urls[0]}
                        alt=""
                        className="w-10 h-10 rounded object-cover border cursor-pointer"
                        onClick={() => setViewing(s)}
                      />
                    ) : <div className="w-10 h-10 bg-muted rounded" />}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{String(s.id).slice(0, 8)}…</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{String(s.user_id ?? '—').slice(0, 8)}…</TableCell>
                  <TableCell className="text-sm">{new Date(s.created_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setViewing(s)}>View</Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDelete(s.id)}>Delete</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(data?.scans ?? []).length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">No scans found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={(data?.scans.length ?? 0) < 50} onClick={() => setPage(p => p + 1)}>Next</Button>
      </div>

      {/* Photo lightbox */}
      <Dialog open={!!viewing} onOpenChange={() => setViewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Scan Images</DialogTitle></DialogHeader>
          <div className="flex flex-wrap gap-2">
            {(viewing?.image_urls ?? []).map((url, i) => (
              <img key={i} src={url} alt={`Image ${i + 1}`} className="max-h-72 rounded border object-contain" />
            ))}
          </div>
          <p className="text-xs text-muted-foreground font-mono">{viewing?.id}</p>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete scan?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This scan and its associated data will be permanently deleted.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={async () => {
                await deleteMutation.mutateAsync(undefined)
                setConfirmDelete(null)
              }}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
