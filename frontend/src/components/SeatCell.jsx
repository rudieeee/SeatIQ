import { useState } from 'react'
import { seatStatusClasses } from '../utils'

const zoneIcons = {
  quiet: '🤫',
  group: '👥',
  computer: '💻',
}

export default function SeatCell({ seat, onClick }) {
  const [popping, setPopping] = useState(false)
  const config = seatStatusClasses[seat.status] ?? seatStatusClasses.disabled
  const isClickable = seat.status === 'available'

  const handleClick = () => {
    if (!isClickable) return
    setPopping(true)
    setTimeout(() => setPopping(false), 200)
    onClick(seat)
  }

  return (
    <button
      onClick={handleClick}
      disabled={!isClickable}
      title={`${seat.label} — ${seat.zone} — ${config.label}`}
      className={`
        relative w-10 h-10 rounded-lg border text-[10px] font-mono font-semibold
        flex flex-col items-center justify-center gap-0.5
        transition-all duration-150 select-none
        ${config.base}
        ${popping ? 'animate-seat-pop' : ''}
      `}
    >
      <span className="leading-none">{seat.label.split('-')[1]}</span>
      {zoneIcons[seat.zone] && (
        <span className="text-[8px] leading-none opacity-70">{zoneIcons[seat.zone]}</span>
      )}
      {/* Status dot */}
      <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${config.dot}`} />
    </button>
  )
}
