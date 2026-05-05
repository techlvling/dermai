import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/api'

export default function NotAdminPage({ reason }: { reason: 'forbidden' | 'unauthenticated' }) {
  async function handleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/admin` },
    })
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.reload()
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-background">
      <h1 className="text-2xl font-semibold text-foreground">
        {reason === 'forbidden' ? 'Access Denied' : 'Sign In Required'}
      </h1>
      <p className="text-muted-foreground text-sm max-w-sm text-center">
        {reason === 'forbidden'
          ? 'Your account does not have admin access. Sign in with an admin Google account.'
          : 'You must be signed in to access the admin panel.'}
      </p>
      {reason === 'forbidden' ? (
        <Button variant="outline" onClick={handleSignOut}>Sign out and try another account</Button>
      ) : (
        <Button onClick={handleSignIn}>Sign in with Google</Button>
      )}
    </div>
  )
}
