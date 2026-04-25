import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getFloorSeats } from '../api'
import { useSocket } from './useSocket'

/**
 * Fetches seats for a floor and applies real-time Socket.IO updates.
 * Returns { seats, isLoading, isError, refetch, updateSeatStatus }
 */
export const useFloorSeats = (floorId) => {
  const [liveSeats, setLiveSeats] = useState(null)

  const updateSeatStatus = useCallback((seatId, status) => {
    setLiveSeats((prev) =>
      prev ? prev.map((s) => (s.id === seatId ? { ...s, status } : s)) : prev
    )
  }, [])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['seats', floorId],
    queryFn: async () => {
      const res = await getFloorSeats(floorId)
      return res.data
    },
    onSuccess: (data) => setLiveSeats(data),
    enabled: !!floorId,
  })

  const seats = liveSeats ?? data ?? []

  useSocket(
    {
      seat_taken:    ({ seat_id }) => updateSeatStatus(seat_id, 'occupied'),
      seat_reserved: ({ seat_id }) => updateSeatStatus(seat_id, 'reserved'),
      seat_released: ({ seat_id }) => updateSeatStatus(seat_id, 'available'),
    },
    [floorId]
  )

  return { seats, isLoading, isError, refetch, updateSeatStatus }
}
