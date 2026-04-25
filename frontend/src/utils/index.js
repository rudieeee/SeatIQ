/**
 * Group a flat seat array into rows keyed by row letter.
 * Input:  [{ label: 'A-1', ... }, { label: 'A-2', ... }, { label: 'B-1', ... }]
 * Output: { A: [...], B: [...] }
 */
export const groupSeatsByRow = (seats = []) => {
  return seats.reduce((acc, seat) => {
    const row = seat.label?.split('-')[0] ?? '?'
    if (!acc[row]) acc[row] = []
    acc[row].push(seat)
    return acc
  }, {})
}

/** Map seat status → Tailwind color classes */
export const seatStatusClasses = {
  available: {
    base: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 cursor-pointer hover:bg-emerald-500 hover:border-emerald-400 hover:text-white hover:scale-110 hover:shadow-lg hover:shadow-emerald-500/30 active:scale-95',
    dot: 'bg-emerald-400',
    label: 'Available',
  },
  occupied: {
    base: 'bg-red-500/15 border-red-500/30 text-red-400/50 cursor-not-allowed opacity-70',
    dot: 'bg-red-500',
    label: 'Occupied',
  },
  reserved: {
    base: 'bg-amber-500/15 border-amber-400/30 text-amber-400/60 cursor-not-allowed opacity-80',
    dot: 'bg-amber-400',
    label: 'Reserved',
  },
  disabled: {
    base: 'bg-surface-800 border-surface-700 text-surface-600 cursor-not-allowed',
    dot: 'bg-surface-600',
    label: 'Disabled',
  },
}

/** Zone badge colors */
export const zoneBadgeClasses = {
  quiet: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  group: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  computer: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
}

/** Format seconds → MM:SS */
export const formatCountdown = (seconds) => {
  if (seconds == null || seconds < 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
