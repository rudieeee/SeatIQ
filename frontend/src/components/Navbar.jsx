import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { disconnectSocket } from '../hooks/useSocket'

const BookIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
  </svg>
)

const SeatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
    <path d="M3 11V3.5a.5.5 0 01.5-.5h.5a2 2 0 012 2v5"/>
    <path d="M21 11V3.5a.5.5 0 00-.5-.5H20a2 2 0 00-2 2v5"/>
    <path d="M3 11h18v2a4 4 0 01-4 4H7a4 4 0 01-4-4v-2z"/>
    <path d="M5 21v-4M19 21v-4"/>
  </svg>
)

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    disconnectSocket()
    logout()
    navigate('/')
  }

  const navLinks = [
    { to: '/floors', label: 'Floors' },
    { to: '/my-booking', label: 'My Booking' },
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-surface-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/floors" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-brand-red flex items-center justify-center glow-red group-hover:scale-105 transition-transform">
            <BookIcon />
          </div>
          <span className="font-display text-2xl text-white tracking-widest">
            LIBRA<span className="text-brand-red">SEAT</span>
          </span>
        </Link>

        {/* Nav links */}
        <nav className="hidden sm:flex items-center gap-1">
          {navLinks.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                location.pathname === to || location.pathname.startsWith(to + '/')
                  ? 'bg-surface-700 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-surface-800'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* User area */}
        <div className="flex items-center gap-3">
          {user && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-800 border border-white/5">
              <div className="w-6 h-6 rounded-full bg-brand-red/20 border border-brand-red/40 flex items-center justify-center">
                <span className="text-brand-red text-xs font-bold">
                  {user.name?.[0]?.toUpperCase() ?? 'U'}
                </span>
              </div>
              <span className="text-sm text-gray-300 font-medium">{user.name}</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-surface-800 transition-all border border-transparent hover:border-white/10"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}
