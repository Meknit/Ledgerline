import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useMarkets } from './lib/prices'
import { useAccount } from './lib/portfolio'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import { Logo } from './components/ui'

export default function App() {
  const { coins, error, updatedAt } = useMarkets()
  const account = useAccount()
  const [view, setView] = useState<'landing' | 'register' | 'login'>('landing')

  if (account.loading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.4, repeat: Infinity }}><Logo size={44} /></motion.div>
      </div>
    )
  }

  const screen = account.user && account.p ? 'dashboard' : view

  return (
    <AnimatePresence mode="wait">
      <motion.div key={screen === 'dashboard' || screen === 'landing' ? screen : 'auth'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
        {screen === 'landing' && <Landing coins={coins} onRegister={() => setView('register')} onLogin={() => setView('login')} />}
        {(screen === 'register' || screen === 'login') && <Auth initialMode={screen} onBack={() => setView('landing')} account={account} />}
        {screen === 'dashboard' && account.user && account.p && (
          <Dashboard p={account.p} user={account.user} account={account} coins={coins} priceError={error} updatedAt={updatedAt} />
        )}
      </motion.div>
    </AnimatePresence>
  )
}
