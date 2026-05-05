import { useState } from 'react'
import { useAdminQuery, useAdminMutation } from '@/lib/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2 } from 'lucide-react'

interface Conflict {
  id: number
  a: string
  b: string
  severity: 'low' | 'medium' | 'high'
  title: string | null
  reason: string | null
  tip: string | null
}
interface CatalogResponse { items: Conflict[]; total: number }

export default function ConflictsPage() {
  const [editing, setEditing] = useState<Partial<Conflict> | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const { data, isLoading } = useAdminQuery<CatalogResponse>(['catalog', 'conflicts'], '/catalog/conflicts', { limit: 500 })
  const createMut = useAdminMutation('/catalog/conflicts', 'POST', [['catalog', 'conflicts']])
  const updateMut = useAdminMutation(`/catalog/conflicts/${editing?.id}`, 'PATCH', [['catalog', 'conflicts']])
  const deleteMut = useAdminMutation(`/catalog/conflicts/${deleteId}`, 'DELETE', [['catalog', 'conflicts']])

  async function save() {
    if (!editing) return
    if (isNew) await createMut.mutateAsync(editing)
    else await updateMut.mutateAsync(editing)
    setEditing(null)
  }

  if (isLoading) return <div className="p-6 space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Ingredient Conflicts</h1>
          <p className="text-sm text-muted-foreground">Safety-critical — edits affect conflict warnings shown to users.</p>
        </div>
        <Button size="sm" onClick={() => { setEditing({ a: '', b: '', severity: 'medium', title: '', reason: '', tip: '' }); setIsNew(true) }}>
          <Plus className="w-4 h-4 mr-1" />Add
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ingredient A</TableHead>
              <TableHead>Ingredient B</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Title</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.items ?? []).map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-sm">{c.a}</TableCell>
                <TableCell className="font-mono text-sm">{c.b}</TableCell>
                <TableCell>
                  <Badge variant={c.severity === 'high' ? 'destructive' : 'secondary'}>{c.severity}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{c.title ?? '—'}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(c); setIsNew(false) }}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{isNew ? 'New Conflict' : 'Edit Conflict'}</SheetTitle></SheetHeader>
          <div className="space-y-4 py-4">
            {(['a','b'] as const).map(field => (
              <div key={field} className="space-y-1.5">
                <Label>Ingredient {field.toUpperCase()}</Label>
                <Input value={(editing as Record<string,string>)?.[field] ?? ''} onChange={e => setEditing(prev => prev ? { ...prev, [field]: e.target.value } : prev)} />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <select className="w-full border rounded-md p-2 text-sm bg-background" value={editing?.severity ?? 'medium'} onChange={e => setEditing(prev => prev ? { ...prev, severity: e.target.value as Conflict['severity'] } : prev)}>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={editing?.title ?? ''} onChange={e => setEditing(prev => prev ? { ...prev, title: e.target.value } : prev)} />
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <textarea className="w-full border rounded-md p-2 text-sm bg-background resize-none h-20" value={editing?.reason ?? ''} onChange={e => setEditing(prev => prev ? { ...prev, reason: e.target.value } : prev)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tip</Label>
              <textarea className="w-full border rounded-md p-2 text-sm bg-background resize-none h-16" value={editing?.tip ?? ''} onChange={e => setEditing(prev => prev ? { ...prev, tip: e.target.value } : prev)} />
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={createMut.isPending || updateMut.isPending}>Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete conflict rule?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This removes the conflict warning for users with these ingredients in their routine.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMut.isPending} onClick={async () => { await deleteMut.mutateAsync(undefined); setDeleteId(null) }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
