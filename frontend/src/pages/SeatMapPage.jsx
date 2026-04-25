import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getFloors } from '../api'
import SeatGrid from '../components/SeatGrid'
import BookingModal from '../components/BookingModal'
import { useFloorSeats } from '../hooks/useFloorSeats'

const SeatMapSkeleton = () => (
  <div className="space-y-4 animate-pulse">
    {['A','B','C','D','E'].map(row => (
      <div key={row} className="flex items-center gap-2">
        <div className="w-8 h-8 bg-surface-700 rounded shimmer-bg" />
        <div className="flex gap-1.5 flex-wrap">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="w-10 h-10 bg-surface-700 rounded-lg shimmer-bg" />
          ))}
        </div>
      </div>
    ))}
  </div>
)

export default function SeatMapPage() {
  const { floorId } = useParams()
  const navigate = useNavigate()
  const [selectedSeat, setSelectedSeat] = useState(null)
  const [bookingSuccess, setBookingSuccess] = useState(null)

  const { seats, isLoading, isError, refetch, updateSeatStatus } = useFloorSeats(floorId)

  // Fetch floor info for display
  const { data: floors = [] } = useQuery({
    queryKey: ['floors'],
    queryFn: async () => { const r = await getFloors(); return r.data },
    staleTime: Infinity,
  })
  const floor = floors.find(f => String(f.id) === String(floorId))

  const handleSeatClick = useCallback((seat) => {
    if (seat.status !== 'available') return
    setSelectedSeat(seat)
  }, [])

  const handleBookingSuccess = useCallback((seat) => {
    // Optimistically mark as occupied locally
    if (updateSeatStatus) updateSeatStatus(seat.id, 'occupied')
    setBookingSuccess(seat)
    setTimeout(() => setBookingSuccess(null), 4000)
  }, [updateSeatStatus])

  const available = seats.filter(s => s.status === 'available').length
  const occupied  = seats.filter(s => s.status === 'occupied').length
  const reserved  = seats.filter(s => s.status === 'reserved').length

  return (
    <div className="min-h-screen px-4 sm:px-6 py-10 relative">
      <div className="absolute top-0 right-0 w-[500px] h-[400px] bg-brand-red/3 blur-[140px] pointer-events-none rounded-full" />

      <div className="max-w-6xl mx-auto relative">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-mono text-gray-600 mb-8">
          <button onClick={() => navigate('/floors')} className="hover:text-gray-300 transition-colors">
            Floors
          </button>
          <span>/</span>
          <span className="text-gray-400">{floor?.name ?? `Floor ${floorId}`}</span>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <p className="font-mono text-xs text-brand-red uppercase tracking-widest mb-2">— Seat Map</p>
            <h1 className="font-display text-5xl sm:text-6xl tracking-widest text-white">
              {floor?.name?.toUpperCase() ?? `FLOOR ${floorId}`}
            </h1>
            {floor?.description && (
              <p className="text-gray-500 text-sm mt-2">{floor.description}</p>
            )}
          </div>

          {/* Live stats */}
          {!isLoading && (
            <div className="flex gap-3">
              {[
                { count: available, label: 'Free', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                { count: occupied,  label: 'Taken', color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
                { count: reserved,  label: 'Reserved', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
              ].map(({ count, label, color, bg }) => (
                <div key={label} className={`rounded-xl px-4 py-2.5 border text-center ${bg}`}>
                  <div className={`font-display text-2xl tracking-wider ${color}`}>{count}</div>
                  <div className="text-[9px] uppercase tracking-widest text-gray-600">{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Success toast */}
        {bookingSuccess && (
          <div className="fixed top-20 right-4 z-40 card-glass border border-emerald-500/30 rounded-xl px-5 py-4 flex items-center gap-3 animate-fade-up shadow-xl">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">✓</div>
            <div>
              <p className="text-white font-semibold text-sm">Booking Confirmed!</p>
              <p className="text-gray-400 text-xs">Seat {bookingSuccess.label} is yours.</p>
            </div>
          </div>
        )}

        {/* Live indicator */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-xs font-mono">LIVE</span>
          </div>
          <span className="text-gray-600 text-xs">Seat availability updates in real-time</span>
        </div>

        {/* Seat map container */}
        <div className="card-glass rounded-2xl p-4 sm:p-6 shadow-2xl">
          {isLoading && <SeatMapSkeleton />}

          {isError && (
            <div className="text-center py-16">
              <p className="text-red-400 mb-3">Failed to load seats</p>
              <button
                onClick={refetch}
                className="px-4 py-2 bg-brand-red hover:bg-brand-redDark text-white rounded-lg text-sm transition-all"
              >
                Retry
              </button>
            </div>
          )}

          {!isLoading && !isError && (
            <SeatGrid seats={seats} onSeatClick={handleSeatClick} />
          )}
        </div>

        {/* My booking shortcut */}
        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/my-booking')}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-4 decoration-gray-700 hover:decoration-gray-400"
          >
            View my current booking →
          </button>
        </div>
      </div>

      {/* Booking modal */}
      {selectedSeat && (
        <BookingModal
          seat={selectedSeat}
          onClose={() => setSelectedSeat(null)}
          onSuccess={handleBookingSuccess}
        />
      )}
    </div>
  )
}
