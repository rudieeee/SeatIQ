import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMyBooking, cancelBooking } from '../api'
import { formatCountdown, zoneBadgeClasses } from '../utils'

// Deterministic pixel QR art from a seed string
const QRDisplay = ({ seed = 'QR' }) => {
  const SIZE = 11
  const cells = Array.from({ length: SIZE * SIZE }, (_, i) => {
    const x = i % SIZE
    const y = Math.floor(i / SIZE)
    // Corner finder patterns
    if ((x < 3 && y < 3) || (x >= SIZE - 3 && y < 3) || (x < 3 && y >= SIZE - 3)) return true
    // Pseudo-random fill from seed
    const code = seed.split('').reduce((a, c, j) => a + c.charCodeAt(0) * (j + 1), 0)
    return ((code * (i + 7) * 2654435761) >>> 16) % 2 === 0
  })

  return (
    <div className="inline-block bg-white p-3 rounded-xl">
      <div
        className="grid gap-0"
        style={{ gridTemplateColumns: `repeat(${SIZE}, 12px)` }}
      >
        {cells.map((on, i) => (
          <div
            key={i}
            style={{ width: 12, height: 12 }}
            className={on ? 'bg-gray-900' : 'bg-white'}
          />
        ))}
      </div>
    </div>
  )
}

const InfoRow = ({ label, value, valueClass = 'text-white' }) => (
  <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
    <span className="text-gray-500 text-sm">{label}</span>
    <span className={`font-medium text-sm ${valueClass}`}>{value}</span>
  </div>
)

const NoBooking = ({ onNavigate }) => (
  <div className="min-h-[70vh] flex items-center justify-center px-4">
    <div className="text-center max-w-xs">
      <div className="w-20 h-20 rounded-full bg-surface-800 border border-white/5 flex items-center justify-center text-3xl mx-auto mb-6">
        🪑
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">No Active Booking</h2>
      <p className="text-gray-500 text-sm mb-6">
        You don't have a seat booked right now. Browse floors to find an available seat.
      </p>
      <button
        onClick={onNavigate}
        className="px-6 py-3 bg-brand-red hover:bg-brand-redDark text-white rounded-xl font-semibold transition-all glow-red hover:scale-105"
      >
        Browse Floors
      </button>
    </div>
  </div>
)

export default function MyBookingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [timeLeft, setTimeLeft] = useState(null)
  const [cancelConfirm, setCancelConfirm] = useState(false)

  const { data: booking, isLoading, isError } = useQuery({
    queryKey: ['my-booking'],
    queryFn: async () => {
      try {
        const res = await getMyBooking()
        return res.data
      } catch (err) {
        if (err.response?.status === 404) return null
        throw err
      }
    },
    refetchInterval: 30_000,
  })

  // Setup countdown
  useEffect(() => {
    if (!booking?.expires_at) { setTimeLeft(null); return }
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(booking.expires_at) - Date.now()) / 1000))
      setTimeLeft(diff)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [booking?.expires_at])

  const { mutate: doCancel, isPending: cancelling } = useMutation({
    mutationFn: () => cancelBooking(booking.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-booking'] })
      setCancelConfirm(false)
    },
  })

  const countdownUrgent = timeLeft !== null && timeLeft < 120

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm font-mono animate-pulse">Loading your booking…</p>
      </div>
    </div>
  )

  if (isError) return (
    <div className="min-h-screen flex items-center justify-center text-red-400">
      Failed to load booking. <button onClick={() => navigate(0)} className="ml-2 underline">Retry</button>
    </div>
  )

  if (!booking) return <NoBooking onNavigate={() => navigate('/floors')} />

  const isReserved = booking.status === 'reserved'
  const isConfirmed = booking.status === 'confirmed'

  return (
    <div className="min-h-screen px-4 sm:px-6 py-10 relative">
      <div className="absolute top-0 left-1/4 w-[500px] h-[400px] bg-brand-gold/3 blur-[130px] pointer-events-none rounded-full" />

      <div className="max-w-md mx-auto relative">
        {/* Header */}
        <div className="mb-8">
          <p className="font-mono text-xs text-brand-red uppercase tracking-widest mb-2">— My Booking</p>
          <h1 className="font-display text-5xl tracking-widest text-white">TICKET</h1>
        </div>

        {/* Ticket card */}
        <div className="card-glass rounded-2xl overflow-hidden shadow-2xl">
          {/* Colored top bar by status */}
          <div className={`h-1.5 w-full ${
            isConfirmed ? 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500' :
            isReserved  ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500' :
            'bg-gradient-to-r from-brand-red via-red-400 to-brand-red'
          }`} />

          <div className="p-6">
            {/* Status badge */}
            <div className="flex items-center justify-between mb-6">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium uppercase tracking-widest ${
                isConfirmed ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                isReserved  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                'bg-red-500/10 border-red-500/30 text-red-400'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${
                  isConfirmed ? 'bg-emerald-400 animate-pulse' :
                  isReserved  ? 'bg-amber-400 animate-pulse' : 'bg-red-400'
                }`} />
                {booking.status}
              </div>
              <span className="font-mono text-gray-600 text-xs">#{String(booking.id).padStart(6, '0')}</span>
            </div>

            {/* Seat hero */}
            <div className="text-center mb-6 py-4 bg-surface-800/60 rounded-xl border border-white/5">
              <p className="text-gray-600 text-xs font-mono uppercase tracking-widest mb-1">Seat</p>
              <p className="font-display text-6xl tracking-widest text-white">
                {booking.seat_label}
              </p>
              {booking.zone && (
                <div className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${zoneBadgeClasses[booking.zone] ?? 'bg-surface-700 text-gray-400'}`}>
                  {booking.zone} zone
                </div>
              )}
            </div>

            {/* Details */}
            <div className="bg-surface-800/40 rounded-xl px-4 mb-5 border border-white/5">
              <InfoRow label="Floor" value={booking.floor_name ?? `Floor ${booking.floor_id}`} />
              {booking.booked_at && (
                <InfoRow
                  label="Booked At"
                  value={new Date(booking.booked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                />
              )}
              {booking.expires_at && (
                <InfoRow
                  label="Expires At"
                  value={new Date(booking.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  valueClass={countdownUrgent ? 'text-red-400' : 'text-amber-400'}
                />
              )}
            </div>

            {/* Countdown (reserved only) */}
            {timeLeft !== null && timeLeft > 0 && isReserved && (
              <div className={`rounded-xl p-4 text-center mb-5 border ${
                countdownUrgent
                  ? 'bg-red-500/10 border-red-500/25 glow-red'
                  : 'bg-amber-500/10 border-amber-500/25 glow-gold'
              }`}>
                <p className={`text-xs uppercase tracking-widest mb-1 font-mono ${countdownUrgent ? 'text-red-400' : 'text-amber-400'}`}>
                  {countdownUrgent ? '⚠️ Expiring soon' : 'Reservation expires in'}
                </p>
                <p className={`font-display text-5xl tracking-widest ${countdownUrgent ? 'text-red-300 animate-pulse' : 'text-amber-300'}`}>
                  {formatCountdown(timeLeft)}
                </p>
                <p className={`text-xs mt-1 ${countdownUrgent ? 'text-red-500' : 'text-amber-600'}`}>
                  Check in before time runs out
                </p>
              </div>
            )}

            {timeLeft === 0 && (
              <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-4 text-center mb-5">
                <p className="text-red-400 font-medium text-sm">Reservation Expired</p>
                <p className="text-red-600 text-xs mt-0.5">Your seat has been released.</p>
              </div>
            )}

            {/* Divider with ticket holes */}
            <div className="relative flex items-center my-5">
              <div className="absolute -left-6 w-5 h-5 rounded-full bg-surface-950 border border-white/5" />
              <div className="flex-1 border-t border-dashed border-white/10" />
              <div className="absolute -right-6 w-5 h-5 rounded-full bg-surface-950 border border-white/5" />
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center gap-3 mb-5">
              <p className="text-gray-600 text-xs font-mono uppercase tracking-widest">Entry QR Code</p>
              <QRDisplay seed={`${booking.id}-${booking.seat_label}`} />
              <p className="text-gray-600 text-[10px] text-center">
                Show this at the library entrance to access your seat
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 space-y-3">
          <button
            onClick={() => navigate(`/floors/${booking.floor_id}/seats`)}
            className="w-full py-3 rounded-xl font-semibold text-sm border border-white/8 bg-surface-800 hover:bg-surface-700 text-gray-300 hover:text-white transition-all"
          >
            View Floor Map
          </button>

          {!cancelConfirm ? (
            <button
              onClick={() => setCancelConfirm(true)}
              className="w-full py-3 rounded-xl font-semibold text-sm text-red-500 hover:text-red-400 hover:bg-red-500/5 border border-transparent hover:border-red-500/20 transition-all"
            >
              Cancel Booking
            </button>
          ) : (
            <div className="card-glass rounded-xl p-4 border border-red-500/25">
              <p className="text-white text-sm font-medium text-center mb-3">Cancel this booking?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setCancelConfirm(false)}
                  className="flex-1 py-2.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-gray-300 text-sm font-medium transition-all"
                >
                  Keep It
                </button>
                <button
                  onClick={() => doCancel()}
                  disabled={cancelling}
                  className="flex-1 py-2.5 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold transition-all"
                >
                  {cancelling ? 'Cancelling…' : 'Yes, Cancel'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
