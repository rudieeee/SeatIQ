# LibraSeat — Library Seat Booking Frontend

A modern, BookMyShow-style library seat booking system built with React 18 + Vite + TailwindCSS.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env: set VITE_API_URL and VITE_SOCKET_URL to your Flask backend

# 3. Start dev server
npm run dev
```

## Project Structure

```
src/
├── api/
│   └── index.js          # Axios instance + all API calls
├── context/
│   └── AuthContext.jsx   # JWT auth state (login / logout)
├── hooks/
│   ├── useSocket.js      # Singleton Socket.IO hook
│   └── useFloorSeats.js  # React Query + real-time seat sync
├── utils/
│   └── index.js          # Seat colors, zone badges, formatters
├── components/
│   ├── Navbar.jsx        # Top navigation bar
│   ├── SeatCell.jsx      # Single seat button (animated)
│   ├── SeatGrid.jsx      # Full seat map with legend + zones
│   └── BookingModal.jsx  # Confirm booking modal
└── pages/
    ├── RegistrationPage.jsx  # Register + auto-login
    ├── FloorSelectorPage.jsx # Floor list with live stats
    ├── SeatMapPage.jsx       # Main seat map page
    └── MyBookingPage.jsx     # QR ticket + countdown
```

## Expected Backend API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register → returns `{ token, user }` |
| GET  | `/api/floors` | List floors with seat counts |
| GET  | `/api/floors/:id/seats` | Seat array for a floor |
| POST | `/api/bookings` | Create booking `{ seat_id }` |
| GET  | `/api/my-booking` | Current user's active booking |
| DELETE | `/api/bookings/:id` | Cancel a booking |

## Socket.IO Events (listened)

| Event | Payload | Action |
|-------|---------|--------|
| `seat_taken` | `{ seat_id }` | Mark seat as occupied |
| `seat_reserved` | `{ seat_id }` | Mark seat as reserved |
| `seat_released` | `{ seat_id }` | Mark seat as available |

## Seat Data Shape

```json
{
  "id": 1,
  "label": "A-3",
  "zone": "quiet",
  "status": "available"
}
```

`zone` values: `quiet` | `group` | `computer`  
`status` values: `available` | `occupied` | `reserved` | `disabled`

## Build

```bash
npm run build     # outputs to dist/
npm run preview   # preview production build
```
