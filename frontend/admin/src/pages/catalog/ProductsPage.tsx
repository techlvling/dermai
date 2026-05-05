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
import { Plus, Pencil, Trash2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

interface Product {
  id: string
  brand: string
  name: string
  category: string
  slot: string
  time_of_day: string
  price_tier: number
  evidence_tier: number
  active: boolean
}
interface CatalogResponse { items: Product[]; total: number }

const EMPTY: Partial<Product> = { brand: '', name: '', category: '', slot: '', time_of_day: 'both', price_tier: 2, evidence_tier: 2, active: true }

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Partial<Product> | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data, isLoading } = useAdminQuery<CatalogResponse>(['catalog', 'products'], '/catalog/products', { limit: 500 })
  const createMut = useAdminMutation('/catalog/products', 'POST', [['catalog', 'products']])
  const updateMut = useAdminMutation(`/catalog/products/${editing?.id}`, 'PATCH', [['catalog', 'products']])
  const deleteMut = useAdminMutation(`/catalog/products/${deleteId}`, 'DELETE', [['catalog', 'products']])

  const filtered = (data?.items ?? []).filter(p =>
    !search || `${p.brand} ${p.name}`.toLowerCase().includes(search.toLowerCase())
  )

  async function save() {
    if (!editing) return
    if (isNew) await createMut.mutateAsync(editing)
    else await updateMut.mutateAsync(editing)
    setEditing(null)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Products</h1>
        <Button size="sm" onClick={() => { setEditing({ ...EMPTY }); setIsNew(true) }}>
          <Plus className="w-4 h-4 mr-1" />Add Product
        </Button>
      </div>

      <Input placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />

      {isLoading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand / Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Slot</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.brand}</div>
                  </TableCell>
                  <TableCell className="text-sm">{p.category}</TableCell>
                  <TableCell className="text-sm">{p.slot}</TableCell>
                  <TableCell className="text-sm">T{p.price_tier}</TableCell>
                  <TableCell className="text-sm">T{p.evidence_tier}</TableCell>
                  <TableCell>
                    <Badge variant={p.active ? 'secondary' : 'outline'}>{p.active ? 'Active' : 'Inactive'}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(p); setIsNew(false) }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit/create sheet */}
      <Sheet open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{isNew ? 'New Product' : 'Edit Product'}</SheetTitle></SheetHeader>
          <div className="space-y-4 py-4">
            {(['brand','name','category','slot'] as const).map(field => (
              <div key={field} className="space-y-1.5">
                <Label className="capitalize">{field}</Label>
                <Input value={(editing as Record<string, string>)?.[field] ?? ''} onChange={e => setEditing(prev => prev ? { ...prev, [field]: e.target.value } : prev)} />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Price Tier (1-4)</Label>
                <Input type="number" min={1} max={4} value={editing?.price_tier ?? 2} onChange={e => setEditing(prev => prev ? { ...prev, price_tier: +e.target.value } : prev)} />
              </div>
              <div className="space-y-1.5">
                <Label>Evidence Tier (1-4)</Label>
                <Input type="number" min={1} max={4} value={editing?.evidence_tier ?? 2} onChange={e => setEditing(prev => prev ? { ...prev, evidence_tier: +e.target.value } : prev)} />
              </div>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={createMut.isPending || updateMut.isPending}>Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete product?</DialogTitle></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMut.isPending} onClick={async () => { await deleteMut.mutateAsync(undefined); setDeleteId(null) }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
