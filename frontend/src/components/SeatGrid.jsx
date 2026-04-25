import { useMemo } from 'react'
import SeatCell from './SeatCell'
import { groupSeatsByRow, zoneBadgeClasses } from '../utils'

const Legend = () => (
  <div className="flex flex-wrap gap-4 justify-center mb-8">
    {[
      { color: 'bg-emerald-500', label: 'Available' },
      { color: 'bg-red-500', label: 'Occupied' },
      { color: 'bg-amber-400', label: 'Reserved' },
      { color: 'bg-surface-600', label: 'Disabled' },
    ].map(({ color, label }) => (
      <div key={label} className="flex items-center gap-2 text-sm text-gray-400">
        <div className={`w-3 h-3 rounded-sm ${color}`} />
        {label}
      </div>
    ))}
    <div className="w-px h-5 bg-white/10 hidden sm:block" />
    {[
      { icon: '🤫', label: 'Quiet' },
      { icon: '👥', label: 'Group' },
      { icon: '💻', label: 'Computer' },
    ].map(({ icon, label }) => (
      <div key={label} className="flex items-center gap-1.5 text-sm text-gray-400">
        <span>{icon}</span>{label}
      </div>
    ))}
  </div>
)

const ZoneHeader = ({ zone, count }) => (
  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${zoneBadgeClasses[zone] ?? 'bg-surface-700 text-gray-300'}`}>
    {zone}
    <span className="opacity-60">·</span>
    <span className="opacity-80">{count} seats</span>
  </div>
)

export default function SeatGrid({ seats, onSeatClick }) {
  const rowMap = useMemo(() => groupSeatsByRow(seats), [seats])
  const rowKeys = useMemo(() => Object.keys(rowMap).sort(), [rowMap])

  if (!seats.length) {
    return (
      <div className="text-center py-20 text-gray-500">
        No seats found for this floor.
      </div>
    )
  }

  // Detect zone changes for visual separators
  let lastZone = null

  return (
    <div className="seat-grid-bg rounded-xl p-4 sm:p-6">
      <Legend />
      <div className="space-y-3">
        {rowKeys.map((row) => {
          const rowSeats = rowMap[row]
          const rowZone = rowSeats[0]?.zone
          const showZoneHeader = rowZone !== lastZone
          lastZone = rowZone

          return (
            <div key={row}>
              {showZoneHeader && rowZone && (
                <div className="flex items-center gap-3 mb-3 mt-4 first:mt-0">
                  <ZoneHeader zone={rowZone} count={rowSeats.length} />
                  <div className="flex-1 h-px bg-white/5" />
                </div>
              )}
              <div className="flex items-center gap-2">
                {/* Row label */}
                <div className="w-8 text-center font-mono text-xs font-bold text-gray-500 shrink-0">
                  {row}
                </div>
                {/* Seats */}
                <div className="flex flex-wrap gap-1.5">
                  {rowSeats.map((seat) => (
                    <SeatCell
                      key={seat.id ?? seat.label}
                      seat={seat}
                      onClick={onSeatClick}
                    />
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Screen/Entrance indicator */}
      <div className="mt-10 flex flex-col items-center gap-1">
        <div className="w-2/3 max-w-xs h-1 rounded-full bg-gradient-to-r from-transparent via-brand-red/50 to-transparent" />
        <div className="w-1/2 max-w-48 h-1 rounded-full bg-gradient-to-r from-transparent via-brand-red/20 to-transparent" />
        <p className="text-xs text-gray-600 mt-1.5 tracking-widest font-mono uppercase">Entrance</p>
      </div>
    </div>
  )
}
