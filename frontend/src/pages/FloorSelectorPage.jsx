import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getFloors } from '../api'

const FloorCardSkeleton = () => (
  <div className="card-glass rounded-2xl p-6 animate-pulse">
    <div className="flex items-start justify-between mb-6">
      <div>
        <div className="w-20 h-3 bg-surface-700 rounded mb-3 shimmer-bg" />
        <div className="w-32 h-6 bg-surface-700 rounded shimmer-bg" />
      </div>
      <div className="w-12 h-12 bg-surface-700 rounded-xl shimmer-bg" />
    </div>
    <div className="grid grid-cols-3 gap-3 mb-5">
      {[1,2,3].map(i => <div key={i} className="h-14 bg-surface-700 rounded-xl shimmer-bg" />)}
    </div>
    <div className="h-11 bg-surface-700 rounded-xl shimmer-bg" />
  </div>
)

const StatPill = ({ value, label, color }) => (
  <div className={`rounded-xl p-3 text-center border ${color}`}>
    <div className="text-xl font-display tracking-wider text-white">{value}</div>
    <div className="text-[10px] uppercase tracking-widest text-gray-500 mt-0.5">{label}</div>
  </div>
)

export default function FloorSelectorPage() {
  const navigate = useNavigate()

  const { data: floors = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['floors'],
    queryFn: async () => {
      const res = await getFloors()
      return res.data
    },
  })

  const totalAvailable = floors.reduce((acc, f) => acc + (f.available_seats ?? 0), 0)
  const totalSeats = floors.reduce((acc, f) => acc + (f.total_seats ?? 0), 0)
  const occupancyPct = totalSeats ? Math.round(((totalSeats - totalAvailable) / totalSeats) * 100) : 0

  return (
    <div className="min-h-screen px-4 sm:px-6 py-10 relative">
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-brand-red/4 blur-[120px] pointer-events-none" />

      <div className="max-w-5xl mx-auto relative">
        {/* Header */}
        <div className="mb-10">
          <p className="font-mono text-xs text-brand-red uppercase tracking-widest mb-2">
            — Select a Floor
          </p>
          <h1 className="font-display text-5xl sm:text-6xl tracking-widest text-white mb-3">
            FLOOR MAP
          </h1>
          <p className="text-gray-500 text-sm max-w-md">
            Choose a floor to view the live seat map. Green seats are available for instant booking.
          </p>
        </div>

        {/* Summary bar */}
        {!isLoading && floors.length > 0 && (
          <div className="card-glass rounded-2xl p-5 mb-8 flex flex-wrap gap-6 items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-gray-400 uppercase tracking-widest font-mono">Live Availability</span>
              </div>
              <div className="w-full bg-surface-700 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700"
                  style={{ width: `${100 - occupancyPct}%` }}
                />
              </div>
              <div className="flex justify-between mt-1.5 text-xs">
                <span className="text-emerald-400">{totalAvailable} available</span>
                <span className="text-gray-600">{totalSeats} total</span>
              </div>
            </div>
            <div className="flex gap-4 text-center">
              <div>
                <div className="font-display text-3xl tracking-wider text-white">{floors.length}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-widest">Floors</div>
              </div>
              <div className="w-px bg-white/8 self-stretch" />
              <div>
                <div className="font-display text-3xl tracking-wider text-emerald-400">{totalAvailable}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-widest">Free</div>
              </div>
              <div className="w-px bg-white/8 self-stretch" />
              <div>
                <div className="font-display text-3xl tracking-wider text-red-400">{occupancyPct}%</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-widest">Occupied</div>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="card-glass rounded-2xl p-8 text-center border border-red-500/20 mb-6">
            <p className="text-red-400 mb-3">Failed to load floors</p>
            <button
              onClick={refetch}
              className="px-4 py-2 bg-brand-red hover:bg-brand-redDark text-white rounded-lg text-sm transition-all"
            >
              Retry
            </button>
          </div>
        )}

        {/* Floor grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <FloorCardSkeleton key={i} />)
            : floors.map((floor, idx) => {
                const available = floor.available_seats ?? 0
                const occupied = floor.occupied_seats ?? 0
                const reserved = floor.reserved_seats ?? 0
                const total = floor.total_seats ?? available + occupied + reserved
                const availPct = total ? Math.round((available / total) * 100) : 0
                const isFull = available === 0

                return (
                  <div
                    key={floor.id}
                    className="card-glass rounded-2xl p-6 hover:border-brand-red/30 transition-all duration-300 hover:shadow-lg hover:shadow-brand-red/5 group animate-fade-up"
                    style={{ animationDelay: `${idx * 60}ms` }}
                  >
                    {/* Floor header */}
                    <div className="flex items-start justify-between mb-5">
                      <div>
                        <p className="text-[10px] font-mono text-gray-600 uppercase tracking-widest mb-1">
                          Floor {floor.number ?? idx + 1}
                        </p>
                        <h3 className="font-display text-2xl tracking-wider text-white group-hover:text-brand-red transition-colors">
                          {floor.name}
                        </h3>
                        {floor.description && (
                          <p className="text-gray-600 text-xs mt-1">{floor.description}</p>
                        )}
                      </div>
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg border shrink-0
                        ${isFull
                          ? 'bg-red-500/10 border-red-500/25'
                          : 'bg-emerald-500/10 border-emerald-500/25'
                        }`}>
                        {isFull ? '🔒' : '🪑'}
                      </div>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-3 gap-2 mb-5">
                      <StatPill
                        value={available}
                        label="Free"
                        color="border-emerald-500/20 bg-emerald-500/5"
                      />
                      <StatPill
                        value={occupied}
                        label="Taken"
                        color="border-red-500/20 bg-red-500/5"
                      />
                      <StatPill
                        value={reserved}
                        label="Reserved"
                        color="border-amber-500/20 bg-amber-500/5"
                      />
                    </div>

                    {/* Availability bar */}
                    <div className="mb-5">
                      <div className="w-full h-1.5 bg-surface-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            availPct > 50 ? 'bg-emerald-500' :
                            availPct > 20 ? 'bg-amber-400' : 'bg-red-500'
                          }`}
                          style={{ width: `${availPct}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-600 mt-1.5 font-mono">
                        {availPct}% available
                      </p>
                    </div>

                    {/* CTA button */}
                    <button
                      onClick={() => navigate(`/floors/${floor.id}/seats`)}
                      disabled={isFull}
                      className={`w-full py-3 rounded-xl font-semibold text-sm transition-all
                        ${isFull
                          ? 'bg-surface-700 text-gray-600 cursor-not-allowed'
                          : 'bg-brand-red hover:bg-brand-redDark text-white glow-red hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                    >
                      {isFull ? 'Floor Full' : 'View Seat Map →'}
                    </button>
                  </div>
                )
              })
          }
        </div>

        {!isLoading && floors.length === 0 && !isError && (
          <div className="card-glass rounded-2xl p-16 text-center">
            <p className="text-4xl mb-4">🏛️</p>
            <p className="text-gray-400 font-medium">No floors available</p>
            <p className="text-gray-600 text-sm mt-1">Check back later or contact the library staff.</p>
          </div>
        )}
      </div>
    </div>
  )
}
