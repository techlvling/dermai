import { useAdminQuery } from '@/lib/hooks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

interface Overview {
  total_users: number
  today_scans: number
  total_scans_period: number
  reaction_alerts: number
  scans_by_day: Record<string, number>
}

export default function AnalyticsPage() {
  const { data, isLoading } = useAdminQuery<Overview>(['analytics', 'overview'], '/analytics/overview', { days: 30 })

  const chartData = data
    ? Object.entries(data.scans_by_day)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-30)
        .map(([date, count]) => ({ date: date.slice(5), count }))
    : []

  if (isLoading) return <div className="p-6"><Skeleton className="h-64" /></div>

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Analytics</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Users', value: data?.total_users ?? 0 },
          { label: 'Scans (30d)', value: data?.total_scans_period ?? 0 },
          { label: 'Today\'s Scans', value: data?.today_scans ?? 0 },
          { label: 'Reaction Alerts', value: data?.reaction_alerts ?? 0 },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">Scans Per Day (Last 30 Days)</CardTitle></CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-muted-foreground text-sm">No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={28} />
                <Tooltip />
                <Bar dataKey="count" name="Scans" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
