import { useParams, useNavigate } from 'react-router-dom'
import { useAdminQuery, useAdminMutation } from '@/lib/hooks'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useState } from 'react'
import { ArrowLeft, Trash2 } from 'lucide-react'

interface UserDetail {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
  last_sign_in: string | null
  scans: Array<{ id: string; created_at: string; image_urls: string[] }>
  reactions: Array<{ id: string; product_id: string; severity: number; notes: string; created_at: string }>
  diary: Array<{ id: string; created_at: string; water_glasses: number; stress_level: number; sleep_hours: number }>
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: user, isLoading } = useAdminQuery<UserDetail>(['users', id!], `/users/${id}`)
  const deleteMutation = useAdminMutation(`/users/${id}`, 'DELETE', [['users']])

  async function handleDelete() {
    await deleteMutation.mutateAsync(undefined)
    navigate('/users')
  }

  if (isLoading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-24 w-72" /><Skeleton className="h-64" /></div>
  }
  if (!user) return <div className="p-6 text-muted-foreground">User not found.</div>

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/users')}><ArrowLeft className="w-4 h-4" /></Button>
        <h1 className="text-xl font-semibold">User Detail</h1>
      </div>

      <Card>
        <CardContent className="pt-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="w-14 h-14">
              <AvatarImage src={user.avatar_url ?? undefined} />
              <AvatarFallback>{(user.display_name ?? user.email)[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <div className="font-semibold">{user.display_name ?? '—'}</div>
              <div className="text-sm text-muted-foreground">{user.email}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Joined {new Date(user.created_at).toLocaleDateString()} ·{' '}
                Last seen {user.last_sign_in ? new Date(user.last_sign_in).toLocaleDateString() : 'never'}
              </div>
            </div>
          </div>
          <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="w-4 h-4 mr-1" />Delete User
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="scans">
        <TabsList>
          <TabsTrigger value="scans">Scans ({user.scans.length})</TabsTrigger>
          <TabsTrigger value="reactions">Reactions ({user.reactions.length})</TabsTrigger>
          <TabsTrigger value="diary">Diary ({user.diary.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="scans" className="space-y-2 mt-3">
          {user.scans.length === 0 ? (
            <p className="text-muted-foreground text-sm">No scans yet.</p>
          ) : user.scans.map(s => (
            <Card key={s.id}>
              <CardContent className="pt-4 flex items-center gap-4">
                {s.image_urls?.[0] && (
                  <img src={s.image_urls[0]} alt="" className="w-16 h-16 rounded object-cover border" />
                )}
                <div className="text-sm">
                  <div className="font-mono text-xs text-muted-foreground">{s.id}</div>
                  <div>{new Date(s.created_at).toLocaleString()}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="reactions" className="space-y-2 mt-3">
          {user.reactions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No reactions logged.</p>
          ) : user.reactions.map(r => (
            <Card key={r.id}>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{r.product_id}</div>
                  <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                  {r.notes && <div className="text-sm mt-1">{r.notes}</div>}
                </div>
                <Badge variant={r.severity >= 4 ? 'destructive' : r.severity >= 3 ? 'secondary' : 'outline'}>
                  Severity {r.severity}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="diary" className="space-y-2 mt-3">
          {user.diary.length === 0 ? (
            <p className="text-muted-foreground text-sm">No diary entries.</p>
          ) : user.diary.map(d => (
            <Card key={d.id}>
              <CardContent className="pt-4 grid grid-cols-3 gap-2 text-sm">
                <div><span className="text-muted-foreground">Date:</span> {new Date(d.created_at).toLocaleDateString()}</div>
                <div><span className="text-muted-foreground">Water:</span> {d.water_glasses} glasses</div>
                <div><span className="text-muted-foreground">Sleep:</span> {d.sleep_hours}h</div>
                <div><span className="text-muted-foreground">Stress:</span> {d.stress_level}/10</div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete user account?</DialogTitle>
            <DialogDescription>
              This permanently deletes {user.email} and all their data (scans, reactions, diary, routine). This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Deleting…' : 'Delete permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
