import { useState } from 'react'
import { useAdminQuery } from '@/lib/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

interface DiaryEntry {
  id: string
  user_id: string
  created_at: string
  water_glasses: number | null
  stress_level: number | null
  sleep_hours: number | null
  symptoms: string[] | null
  wellness_score: number | null
}
interface DiaryResponse { entries: DiaryEntry[]; total: number }

export default function DiaryPage() {
  const [hasSymptoms, setHasSymptoms] = useState(false)
  const [page, setPage] = useState(1)

  const { data, isLoading } = useAdminQuery<DiaryResponse>(
    ['diary', hasSymptoms ? 'symptoms' : 'all'],
    '/diary',
    { page, limit: 50, ...(hasSymptoms ? { has_symptoms: 'true' } : {}) },
  )

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Diary Entries</h1>
          <p className="text-sm text-muted-foreground">Lifestyle check-ins from all users.</p>
        </div>
        <span className="text-sm text-muted-foreground">{data?.total ?? 0} entries</span>
      </div>

      <Button
        variant={hasSymptoms ? 'default' : 'outline'}
        size="sm"
        onClick={() => { setHasSymptoms(v => !v); setPage(1) }}
      >
        {hasSymptoms ? 'Showing: has symptoms' : 'Filter: has symptoms'}
      </Button>

      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Water</TableHead>
                <TableHead>Sleep</TableHead>
                <TableHead>Stress</TableHead>
                <TableHead>Wellness</TableHead>
                <TableHead>Symptoms</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.entries ?? []).map(e => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{(e.user_id ?? '—').slice(0, 8)}…</TableCell>
                  <TableCell className="text-sm">{new Date(e.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-sm">{e.water_glasses ?? '—'}</TableCell>
                  <TableCell className="text-sm">{e.sleep_hours ?? '—'}</TableCell>
                  <TableCell className="text-sm">{e.stress_level ?? '—'}</TableCell>
                  <TableCell className="text-sm">{e.wellness_score ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(e.symptoms ?? []).map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(data?.entries ?? []).length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No diary entries.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={(data?.entries.length ?? 0) < 50} onClick={() => setPage(p => p + 1)}>Next</Button>
      </div>
    </div>
  )
}
