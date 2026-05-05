import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminQuery } from '@/lib/hooks'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { downloadCsv } from '@/lib/csv'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

interface User {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
  last_sign_in: string | null
  scan_count: number
  reaction_count: number
}

interface UsersResponse {
  users: User[]
  total: number
  page: number
  limit: number
}

export default function UsersPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useAdminQuery<UsersResponse>(
    ['users'],
    '/users',
    { q, page, limit: 50 },
  )

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Users</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{data?.total ?? 0} total</span>
          <Button variant="outline" size="sm" disabled={!data?.users.length}
            onClick={() => downloadCsv('users.csv', (data?.users ?? []).map(u => ({
              id: u.id, email: u.email, display_name: u.display_name ?? '',
              scan_count: u.scan_count, reaction_count: u.reaction_count,
              created_at: u.created_at, last_sign_in: u.last_sign_in ?? '',
            })))}>
            Export CSV
          </Button>
        </div>
      </div>

      <Input
        placeholder="Search by email or name…"
        value={q}
        onChange={e => { setQ(e.target.value); setPage(1) }}
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Scans</TableHead>
                <TableHead className="text-right">Reactions</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Last Sign In</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.users ?? []).map(u => (
                <TableRow
                  key={u.id}
                  className="cursor-pointer hover:bg-accent/30"
                  onClick={() => navigate(`/users/${u.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="w-7 h-7">
                        <AvatarImage src={u.avatar_url ?? undefined} />
                        <AvatarFallback>{(u.display_name ?? u.email)[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium truncate max-w-32">{u.display_name ?? '—'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-right text-sm">{u.scan_count}</TableCell>
                  <TableCell className="text-right text-sm">
                    {u.reaction_count > 0 ? (
                      <Badge variant={u.reaction_count >= 3 ? 'destructive' : 'secondary'}>{u.reaction_count}</Badge>
                    ) : '0'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.last_sign_in ? new Date(u.last_sign_in).toLocaleDateString() : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {(data?.users ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No users found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={(data?.users.length ?? 0) < 50} onClick={() => setPage(p => p + 1)}>Next</Button>
      </div>
    </div>
  )
}
