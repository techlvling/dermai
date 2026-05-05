import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAdminQuery } from '@/lib/hooks'
import { Badge } from '@/components/ui/badge'
import {
  LayoutDashboard, Users, Camera, AlertTriangle, BookOpen,
  Package, FlaskConical, Target, Zap, Database, Activity,
  Link2, BarChart2, LogOut, ChevronDown,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface OverviewData {
  reaction_alerts: number
}

const catalogLinks = [
  { to: 'products',    label: 'Products',    icon: Package },
  { to: 'ingredients', label: 'Ingredients', icon: FlaskConical },
  { to: 'concerns',    label: 'Concerns',    icon: Target },
  { to: 'conflicts',   label: 'Conflicts',   icon: Zap },
]

const navLinks = [
  { to: '/',          label: 'Overview',    icon: LayoutDashboard, end: true },
  { to: 'users',      label: 'Users',       icon: Users },
  { to: 'scans',      label: 'Scans',       icon: Camera },
  { to: 'reactions',  label: 'Reactions',   icon: AlertTriangle },
  { to: 'diary',      label: 'Diary',       icon: BookOpen },
]

const systemLinks = [
  { to: 'evidence',  label: 'Evidence Cache', icon: Database },
  { to: 'ai-usage',  label: 'AI Usage',       icon: Activity },
  { to: 'affiliate', label: 'Affiliate',      icon: Link2 },
  { to: 'analytics', label: 'Analytics',      icon: BarChart2 },
]

function NavItem({ to, label, icon: Icon, end, badge }: {
  to: string; label: string; icon: React.ElementType; end?: boolean; badge?: number
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
          isActive
            ? 'bg-accent text-accent-foreground font-medium'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
        )
      }
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {!!badge && <Badge variant="destructive" className="text-xs px-1.5 py-0 h-5">{badge}</Badge>}
    </NavLink>
  )
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const [catalogOpen, setCatalogOpen] = useState(true)
  const { data: overview } = useAdminQuery<OverviewData>(['analytics', 'overview'], '/analytics/overview')
  const reactionAlerts = overview?.reaction_alerts ?? 0

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/')
    window.location.reload()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 flex flex-col border-r bg-sidebar overflow-y-auto">
        <div className="px-4 py-5 border-b">
          <span className="font-semibold text-sm tracking-tight">DermAI Admin</span>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {navLinks.map(l => (
            <NavItem key={l.to} {...l} badge={l.to === 'reactions' ? reactionAlerts : undefined} />
          ))}

          <Separator className="my-2" />

          <button
            className="flex items-center gap-2.5 px-3 py-2 w-full text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground"
            onClick={() => setCatalogOpen(o => !o)}
          >
            <span className="flex-1">Catalog</span>
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', catalogOpen && 'rotate-180')} />
          </button>

          {catalogOpen && catalogLinks.map(l => (
            <NavItem key={l.to} {...l} />
          ))}

          <Separator className="my-2" />

          <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">System</p>
          {systemLinks.map(l => (
            <NavItem key={l.to} {...l} />
          ))}
        </nav>

        <div className="px-2 py-3 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={signOut}>
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
