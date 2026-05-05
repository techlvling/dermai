import { useState } from 'react'
import { useAdminQuery, useAdminMutation } from '@/lib/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2 } from 'lucide-react'

interface Concern {
  id: string
  name: string
  target_ingredients: string[]
  rationale: string | null
}
interface CatalogResponse { items: Concern[]; total: number }

export default function ConcernsPage() {
  const [editing, setEditing] = useState<Partial<Concern> | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data, isLoading } = useAdminQuery<CatalogResponse>(['catalog', 'concerns'], '/catalog/concerns', { limit: 500 })
  const createMut = useAdminMutation('/catalog/concerns', 'POST', [['catalog', 'concerns']])
  const updateMut = useAdminMutation(`/catalog/concerns/${editing?.id}`, 'PATCH', [['catalog', 'concerns']])
  const deleteMut = useAdminMutation(`/catalog/concerns/${deleteId}`, 'DELETE', [['catalog', 'concerns']])

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
        <h1 className="text-xl font-semibold">Concerns</h1>
        <Button size="sm" onClick={() => { setEditing({ id: '', name: '', target_ingredients: [], rationale: '' }); setIsNew(true) }}>
          <Plus className="w-4 h-4 mr-1" />Add
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID / Name</TableHead>
              <TableHead>Ingredients</TableHead>
              <TableHead>Rationale</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.items ?? []).map(c => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="font-medium text-sm">{c.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{c.id}</div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{(c.target_ingredients ?? []).join(', ') || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{c.rationale ?? '—'}</TableCell>
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
          <SheetHeader><SheetTitle>{isNew ? 'New Concern' : 'Edit Concern'}</SheetTitle></SheetHeader>
          <div className="space-y-4 py-4">
            {(['id','name'] as const).map(field => (
              <div key={field} className="space-y-1.5">
                <Label className="capitalize">{field}</Label>
                <Input value={(editing as Record<string,string>)?.[field] ?? ''} onChange={e => setEditing(prev => prev ? { ...prev, [field]: e.target.value } : prev)} />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Ingredient IDs (comma-separated)</Label>
              <Input
                value={(editing?.target_ingredients ?? []).join(', ')}
                onChange={e => setEditing(prev => prev ? { ...prev, target_ingredients: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } : prev)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rationale</Label>
              <textarea className="w-full border rounded-md p-2 text-sm bg-background resize-none h-24" value={editing?.rationale ?? ''} onChange={e => setEditing(prev => prev ? { ...prev, rationale: e.target.value } : prev)} />
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
          <DialogHeader><DialogTitle>Delete concern?</DialogTitle></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMut.isPending} onClick={async () => { await deleteMut.mutateAsync(undefined); setDeleteId(null) }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
