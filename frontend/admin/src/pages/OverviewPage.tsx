import { useAdminQuery } from '@/lib/hooks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, Camera, AlertTriangle, Database, Activity } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

interface Overview {
  total_users: number
  today_scans: number
  total_scans_period: number
  reaction_alerts: number
  evidence_last_refreshed: string | null
  scans_by_day: Record<string, number>
}

function StatCard({
  title, value, icon: Icon, alert,
}: { title: string; value: string | number; icon: React.ElementType; alert?: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold">{value}</span>
          {alert && <Badge variant="destructive">Alert</Badge>}
        </div>
      </CardContent>
    </Card>
  )
}

export default function OverviewPage() {
  const { data, isLoading } = useAdminQuery<Overview>(['analytics', 'overview'], '/analytics/overview')

  const chartData = data
    ? Object.entries(data.scans_by_day)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-30)
        .map(([date, count]) => ({ date: date.slice(5), count }))
    : []

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-xl font-semibold">Overview</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    )
  }

  const evidenceAge = data?.evidence_last_refreshed
    ? Math.round((Date.now() - new Date(data.evidence_last_refreshed).getTime()) / 86400000)
    : null

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Overview</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Users" value={data?.total_users ?? 0} icon={Users} />
        <StatCard title="Scans Today" value={data?.today_scans ?? 0} icon={Camera} />
        <StatCard
          title="Reaction Alerts (≥4)"
          value={data?.reaction_alerts ?? 0}
          icon={AlertTriangle}
          alert={(data?.reaction_alerts ?? 0) > 0}
        />
        <StatCard
          title="Evidence Cache"
          value={evidenceAge !== null ? `${evidenceAge}d ago` : 'Unknown'}
          icon={Database}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Scans — Last 30 Days</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-muted-foreground text-sm">No scan data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={30} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.1)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">System Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Evidence last refreshed</span>
            <span>{data?.evidence_last_refreshed ? new Date(data.evidence_last_refreshed).toLocaleString() : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Scans (30d)</span>
            <span>{data?.total_scans_period ?? 0}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
