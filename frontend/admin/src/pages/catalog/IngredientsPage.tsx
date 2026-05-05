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

interface Ingredient {
  id: string
  name: string
  category: string
  evidence_tier: number
  summary: string | null
}
interface CatalogResponse { items: Ingredient[]; total: number }

const EMPTY: Partial<Ingredient> = { id: '', name: '', category: '', evidence_tier: 2, summary: '' }

export default function IngredientsPage() {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Partial<Ingredient> | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data, isLoading } = useAdminQuery<CatalogResponse>(['catalog', 'ingredients'], '/catalog/ingredients', { limit: 500 })
  const createMut = useAdminMutation('/catalog/ingredients', 'POST', [['catalog', 'ingredients']])
  const updateMut = useAdminMutation(`/catalog/ingredients/${editing?.id}`, 'PATCH', [['catalog', 'ingredients']])
  const deleteMut = useAdminMutation(`/catalog/ingredients/${deleteId}`, 'DELETE', [['catalog', 'ingredients']])

  const filtered = (data?.items ?? []).filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))

  async function save() {
    if (!editing) return
    if (isNew) await createMut.mutateAsync(editing)
    else await updateMut.mutateAsync(editing)
    setEditing(null)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Ingredients</h1>
        <Button size="sm" onClick={() => { setEditing({ ...EMPTY }); setIsNew(true) }}>
          <Plus className="w-4 h-4 mr-1" />Add
        </Button>
      </div>

      <Input placeholder="Search ingredients…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />

      {isLoading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID / Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(ing => (
                <TableRow key={ing.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{ing.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{ing.id}</div>
                  </TableCell>
                  <TableCell className="text-sm">{ing.category}</TableCell>
                  <TableCell className="text-sm">T{ing.evidence_tier}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{ing.summary ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(ing); setIsNew(false) }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(ing.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Sheet open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{isNew ? 'New Ingredient' : 'Edit Ingredient'}</SheetTitle></SheetHeader>
          <div className="space-y-4 py-4">
            {(['id','name','category'] as const).map(field => (
              <div key={field} className="space-y-1.5">
                <Label className="capitalize">{field}</Label>
                <Input value={(editing as Record<string,string>)?.[field] ?? ''} onChange={e => setEditing(prev => prev ? { ...prev, [field]: e.target.value } : prev)} />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Evidence Tier (1-4)</Label>
              <Input type="number" min={1} max={4} value={editing?.evidence_tier ?? 2} onChange={e => setEditing(prev => prev ? { ...prev, evidence_tier: +e.target.value } : prev)} />
            </div>
            <div className="space-y-1.5">
              <Label>Summary</Label>
              <textarea
                className="w-full border rounded-md p-2 text-sm bg-background resize-none h-24"
                value={editing?.summary ?? ''}
                onChange={e => setEditing(prev => prev ? { ...prev, summary: e.target.value } : prev)}
              />
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
          <DialogHeader><DialogTitle>Delete ingredient?</DialogTitle></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMut.isPending} onClick={async () => { await deleteMut.mutateAsync(undefined); setDeleteId(null) }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
