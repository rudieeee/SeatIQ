import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10000,
})

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/'
    }
    return Promise.reject(error)
  }
)

// ── Auth ──────────────────────────────────────────────────
export const registerUser = (data) => api.post('/auth/register', data)
export const loginUser = (data) => api.post('/auth/login', data)

// ── Floors ────────────────────────────────────────────────
export const getFloors = () => api.get('/floors')

// ── Seats ─────────────────────────────────────────────────
export const getFloorSeats = (floorId) => api.get(`/floors/${floorId}/seats`)

// ── Bookings ──────────────────────────────────────────────
export const createBooking = (seatId) => api.post('/bookings', { seat_id: seatId })
export const getMyBooking = () => api.get('/my-booking')
export const cancelBooking = (bookingId) => api.delete(`/bookings/${bookingId}`)

export default api
