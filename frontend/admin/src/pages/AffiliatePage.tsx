import { useState } from 'react'
import { useAdminQuery } from '@/lib/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { adminFetch } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'

interface Region {
  country_code: string
  country_name: string
  tag: string | null
  tld: string
}

export default function AffiliatePage() {
  const { data: regions, isLoading } = useAdminQuery<Region[]>(['affiliate', 'regions'], '/affiliate/regions')
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const qc = useQueryClient()

  function setTag(code: string, tag: string) {
    setEdits(prev => ({ ...prev, [code]: tag }))
  }

  async function saveTag(code: string) {
    const tag = edits[code] ?? regions?.find(r => r.country_code === code)?.tag ?? ''
    setSaving(code)
    try {
      await adminFetch(`/affiliate/regions/${code}`, {
        method: 'PATCH',
        body: JSON.stringify({ tag }),
      })
      toast.success(`Saved tag for ${code}`)
      qc.invalidateQueries({ queryKey: ['affiliate', 'regions'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Affiliate Regions</h1>
        <p className="text-sm text-muted-foreground">Enter your Amazon Associates tag for each region as you get approved.</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Region</TableHead>
                <TableHead>TLD</TableHead>
                <TableHead>Associates Tag</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(regions ?? []).map(r => {
                const currentTag = edits[r.country_code] ?? r.tag ?? ''
                const dirty = edits[r.country_code] !== undefined && edits[r.country_code] !== (r.tag ?? '')
                return (
                  <TableRow key={r.country_code}>
                    <TableCell>
                      <div className="font-medium text-sm">{r.country_name || r.country_code}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">amazon.{r.tld || r.country_code.toLowerCase()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          value={currentTag}
                          onChange={e => setTag(r.country_code, e.target.value)}
                          placeholder="e.g. tinkref-21"
                          className="h-8 w-48"
                        />
                        {!currentTag && <Badge variant="outline" className="text-xs">Not set</Badge>}
                        {currentTag && !dirty && <Badge variant="secondary" className="text-xs">Active</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant={dirty ? 'default' : 'ghost'}
                        size="sm"
                        disabled={!dirty || saving === r.country_code}
                        onClick={() => saveTag(r.country_code)}
                      >
                        <Save className="w-3.5 h-3.5 mr-1" />
                        {saving === r.country_code ? 'Saving…' : 'Save'}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
