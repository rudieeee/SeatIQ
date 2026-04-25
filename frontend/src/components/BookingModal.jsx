import { useState, useEffect } from 'react'
import { createBooking } from '../api'
import { zoneBadgeClasses } from '../utils'

const zoneIcons = { quiet: '🤫', group: '👥', computer: '💻' }

export default function BookingModal({ seat, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleConfirm = async () => {
    setLoading(true)
    setError('')
    try {
      await createBooking(seat.id)
      onSuccess(seat)
      onClose()
    } catch (err) {
      setError(err.response?.data?.message || 'Seat already taken or booking failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-sm card-glass rounded-2xl overflow-hidden shadow-2xl animate-fade-up">
        {/* Header stripe */}
        <div className="h-1 w-full bg-gradient-to-r from-brand-red via-brand-gold to-brand-red" />

        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <p className="text-gray-500 text-xs font-mono uppercase tracking-widest mb-1">Booking Confirmation</p>
              <h2 className="text-2xl font-display tracking-widest text-white">
                SEAT <span className="text-brand-red">{seat.label}</span>
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-surface-700 hover:bg-surface-600 text-gray-400 hover:text-white flex items-center justify-center transition-all"
            >
              ✕
            </button>
          </div>

          {/* Seat details card */}
          <div className="bg-surface-800 rounded-xl p-4 mb-4 space-y-3 border border-white/5">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm">Seat ID</span>
              <span className="font-mono text-white font-semibold">{seat.label}</span>
            </div>
            <div className="h-px bg-white/5" />
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm">Zone</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${zoneBadgeClasses[seat.zone] ?? 'bg-surface-700 text-gray-300'}`}>
                {zoneIcons[seat.zone]} {seat.zone}
              </span>
            </div>
            <div className="h-px bg-white/5" />
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm">Status</span>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-400 text-sm font-medium capitalize">{seat.status}</span>
              </div>
            </div>
          </div>

          {/* Info note */}
          <p className="text-gray-500 text-xs mb-4 leading-relaxed">
            Booking holds the seat for 15 minutes. Check in at the entrance with your QR code.
          </p>

          {/* Error message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/25 text-red-400 px-4 py-3 rounded-xl mb-4 text-sm flex items-start gap-2">
              <span className="shrink-0 mt-0.5">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 bg-surface-700 hover:bg-surface-600 text-gray-300 hover:text-white py-3 rounded-xl font-medium transition-all border border-white/5"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2
                ${loading
                  ? 'bg-brand-red/50 text-white/50 cursor-not-allowed'
                  : 'bg-brand-red hover:bg-brand-redDark text-white glow-red hover:scale-[1.02] active:scale-[0.98]'
                }`}
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Booking…
                </>
              ) : (
                'Confirm Booking'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
