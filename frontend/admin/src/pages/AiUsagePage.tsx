import { useAdminQuery } from '@/lib/hooks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

interface AiUsage {
  by_day: Record<string, Record<string, { calls: number; prompt_tokens: number; completion_tokens: number; errors: number }>>
  failures: Array<{ ts: string; route: string; provider: string; model: string; error: string }>
  total: number
}

export default function AiUsagePage() {
  const { data, isLoading } = useAdminQuery<AiUsage>(['ai-usage'], '/ai-usage')

  const chartData = data
    ? Object.entries(data.by_day)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, providers]) => ({
          date: date.slice(5),
          aistudio: providers['aistudio']?.calls ?? 0,
          openrouter: providers['openrouter']?.calls ?? 0,
        }))
    : []

  if (isLoading) return <div className="p-6"><Skeleton className="h-64" /></div>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">AI Usage</h1>
        <span className="text-sm text-muted-foreground">{data?.total ?? 0} calls in last 30d</span>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">Calls per Day by Provider</CardTitle></CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-muted-foreground text-sm">No AI usage data yet. Instrumentation logs to <code className="bg-muted px-1 rounded text-xs">ai_usage_log</code> after Phase 3 migration.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={30} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="aistudio"   name="AI Studio"   stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} stackId="1" />
                <Area type="monotone" dataKey="openrouter" name="OpenRouter"   stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} stackId="1" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {(data?.failures.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-destructive">Recent Failures</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data!.failures.map((f, i) => (
              <div key={i} className="text-sm border-b pb-2 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">{f.provider}</Badge>
                  <span className="text-muted-foreground">{f.route}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{new Date(f.ts).toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{f.error}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
