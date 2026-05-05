import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/api'
import AdminLayout from '@/components/layout/AdminLayout'
import OverviewPage from '@/pages/OverviewPage'
import UsersPage from '@/pages/UsersPage'
import UserDetailPage from '@/pages/UserDetailPage'
import ScansPage from '@/pages/ScansPage'
import ReactionsPage from '@/pages/ReactionsPage'
import DiaryPage from '@/pages/DiaryPage'
import ProductsPage from '@/pages/catalog/ProductsPage'
import IngredientsPage from '@/pages/catalog/IngredientsPage'
import ConcernsPage from '@/pages/catalog/ConcernsPage'
import ConflictsPage from '@/pages/catalog/ConflictsPage'
import EvidencePage from '@/pages/EvidencePage'
import AiUsagePage from '@/pages/AiUsagePage'
import AffiliatePage from '@/pages/AffiliatePage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import NotAdminPage from '@/pages/NotAdminPage'
import LoadingPage from '@/pages/LoadingPage'

export default function App() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'forbidden' | 'unauthenticated'>('loading')

  useEffect(() => {
    async function check() {
      const { data } = await supabase.auth.getSession()
      if (!data.session) { setStatus('unauthenticated'); return }
      try {
        const res = await fetch('/api/admin/whoami', {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        })
        if (res.status === 403) { setStatus('forbidden'); return }
        if (!res.ok) { setStatus('unauthenticated'); return }
        setStatus('ok')
      } catch {
        setStatus('unauthenticated')
      }
    }
    check()
  }, [])

  if (status === 'loading') return <LoadingPage />
  if (status === 'forbidden') return <NotAdminPage reason="forbidden" />
  if (status === 'unauthenticated') return <NotAdminPage reason="unauthenticated" />

  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:id" element={<UserDetailPage />} />
        <Route path="scans" element={<ScansPage />} />
        <Route path="reactions" element={<ReactionsPage />} />
        <Route path="diary" element={<DiaryPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="ingredients" element={<IngredientsPage />} />
        <Route path="concerns" element={<ConcernsPage />} />
        <Route path="conflicts" element={<ConflictsPage />} />
        <Route path="evidence" element={<EvidencePage />} />
        <Route path="ai-usage" element={<AiUsagePage />} />
        <Route path="affiliate" element={<AffiliatePage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
