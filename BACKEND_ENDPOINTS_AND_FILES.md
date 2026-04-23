# SeatIQ Backend Documentation

This document explains:
- What each backend file is responsible for.
- All API endpoints, request payloads, and expected behavior.
- Real-time Socket.IO events.

## 1) Backend File Responsibilities

### backend/app.py
- Creates and configures the Flask app.
- Registers all blueprints (`/auth`, `/users`, `/seats`, `/bookings`, `/admin`).
- Initializes database tables on startup.
- Bootstraps default floor/seat layout.
- Starts background scheduler jobs for:
  - Hostel booking 10-minute expiry.
  - 1-hour idle seat auto-release.
- Exposes health endpoint: `GET /health`.

### backend/config.py
- Central configuration for secrets and environment variables.
- DB URL, CORS, booking TTL, idle timeout, scheduler intervals.
- Default seat map generation values (floors, rows, seats per row).

### backend/extensions.py
- Shared extension objects:
  - SQLAlchemy (`db`)
  - JWT (`jwt`)
  - CORS (`cors`)
  - Socket.IO (`socketio`)
  - APScheduler (`scheduler`)

### backend/users.py
- Defines `User` model.
- Password hashing and verification methods.
- User profile and dashboard APIs.

### backend/auth.py
- Authentication APIs:
  - Register
  - Login
  - Current authenticated user
- Issues JWT access token.

### backend/seats.py
- Defines `Seat` model.
- Seat map bootstrap helper (`bootstrap_seats`).
- Floor list and floor layout APIs.

### backend/bookings.py
- Defines `Booking` model.
- Core booking lifecycle:
  - Create booking
  - Check-in
  - Heartbeat
  - Release
  - Fetch my bookings
- Emits live Socket.IO seat events.
- Contains reusable booking release helper (`release_booking`).

### backend/admin.py
- Admin-only routes.
- View active bookings.
- Force release bookings.
- View all seat states.
- Reseed seat map.

### backend/requirements.txt
- Python packages required to run backend.

## 2) Base API Info

- Base URL (local): `http://localhost:5000`
- Auth type: JWT Bearer token
- Header for protected routes:

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

## 3) Endpoint Reference

## 3.1 Health

### GET /health
Purpose:
- Check backend availability.

Response (200):
```
{
  "status": "ok",
  "service": "SeatIQ backend"
}
```

## 3.2 Auth Endpoints

### POST /auth/register
Purpose:
- Register a new user.

Request body:
```
{
  "full_name": "Rudra Yadav",
  "roll_no": "22CS101",
  "password": "secret123",
  "email": "rudra@example.com",
  "hostel_resident": true,
  "is_admin": false
}
```

Notes:
- `full_name`, `roll_no`, `password` required.
- Password minimum 6 chars.
- `roll_no` and `email` must be unique.

Response (201):
```
{
  "message": "User registered",
  "user": { ... }
}
```

### POST /auth/login
Purpose:
- Login by roll number and password.

Request body:
```
{
  "roll_no": "22CS101",
  "password": "secret123"
}
```

Response (200):
```
{
  "access_token": "<jwt>",
  "user": { ... }
}
```

### GET /auth/me
Purpose:
- Get currently authenticated user.

Auth required: Yes

Response (200):
```
{
  "user": { ... }
}
```

## 3.3 User Endpoints

### GET /users/me
Purpose:
- Fetch profile details for current user.

Auth required: Yes

### GET /users/dashboard
Purpose:
- Get user dashboard data:
  - user profile
  - active booking
  - recent booking history

Auth required: Yes

Response shape:
```
{
  "user": { ... },
  "active_booking": { ... } | null,
  "recent_bookings": [ ... ]
}
```

## 3.4 Seat Endpoints

### GET /seats/floors
Purpose:
- List available floors with seat counts.

Auth required: Optional

Response (200):
```
{
  "floors": [
    {
      "floor_number": 1,
      "total_seats": 50,
      "available_seats": 42
    }
  ]
}
```

### GET /seats/layout?floor=1
Purpose:
- Get seat layout for selected floor.

Auth required: Optional

Query params:
- `floor` (int, required)

Response (200):
```
{
  "floor": 1,
  "rows": {
    "A": [ ... ],
    "B": [ ... ]
  },
  "seats": [ ... ]
}
```

## 3.5 Booking Endpoints

### POST /bookings
Purpose:
- Create a booking for a seat.

Auth required: Yes

Request body:
```
{
  "seat_id": 12,
  "source": "hostel"
}
```

`source` values:
- `library`
- `hostel`

Business rules:
- One active booking per user.
- Seat must be `available`.
- Hostel booking only for `hostel_resident = true`.
- Hostel booking gets 10-minute check-in TTL.

Response (201):
```
{
  "message": "Seat booked",
  "booking": { ... }
}
```

### POST /bookings/<booking_id>/check-in
Purpose:
- Confirm arrival at seat (mainly for hostel reservations).

Auth required: Yes

Behavior:
- If hostel TTL expired before check-in, booking is expired and seat released.
- On success, seat moves to `occupied`.

### POST /bookings/<booking_id>/heartbeat
Purpose:
- Keep booking active by updating activity timestamp.

Auth required: Yes

Behavior:
- Requires active booking and completed check-in.
- Used for idle timeout logic (1-hour rule).

### POST /bookings/<booking_id>/release
Purpose:
- User manually releases seat.

Auth required: Yes

Behavior:
- Booking status becomes `released`.
- Seat becomes `available`.

### GET /bookings/my
Purpose:
- Get current user booking summary.

Auth required: Yes

Response (200):
```
{
  "active": { ... } | null,
  "history": [ ... ]
}
```

## 3.6 Admin Endpoints

All endpoints below require admin JWT (`is_admin=true` in token claims).

### GET /admin/bookings/active
Purpose:
- List all active bookings system-wide.

### POST /admin/bookings/<booking_id>/force-release
Purpose:
- Admin force releases an active booking.

Response (200):
```
{
  "message": "Booking force released"
}
```

### GET /admin/seats
Purpose:
- Get all seats with current states.

### POST /admin/seats/reseed
Purpose:
- Clear and regenerate seat map.

Request body:
```
{
  "confirm": true
}
```

Safety:
- Reseed is blocked if active bookings exist.

## 4) Automatic Expiry Rules

### Rule A: Hostel booking TTL (10 minutes)
- When booked from hostel, booking is created with `expires_at = now + 10 minutes`.
- User must check in before TTL.
- If not checked in, background job expires booking and frees seat.

### Rule B: Idle timeout (1 hour)
- For checked-in bookings, inactivity is tracked via `last_activity_at`.
- If no heartbeat/activity for over 60 minutes, background job releases seat.

## 5) Seat and Booking Statuses

Seat status:
- `available`
- `reserved` (hostel booked, waiting for check-in)
- `occupied` (checked in / actively used)

Booking status:
- `active`
- `released`
- `expired`

## 6) Socket.IO Events

The backend broadcasts these events for real-time frontend updates:

### seat_update
Payload: seat object
- Fired whenever seat status changes.

### booking_expired
Payload:
```
{
  "booking_id": 1,
  "seat_id": 12,
  "user_id": 5,
  "reason": "hostel_checkin_timeout" | "idle_timeout"
}
```

### seat_released
Payload:
```
{
  "booking_id": 1,
  "seat_id": 12,
  "user_id": 5,
  "reason": "user_released" | "admin_override"
}
```

## 7) Suggested Request Order for Frontend

1. Register/Login
2. Save JWT token
3. `GET /seats/floors`
4. `GET /seats/layout?floor=<n>`
5. `POST /bookings`
6. If hostel booking, call check-in within 10 minutes
7. Periodically call heartbeat while user stays on seat
8. Subscribe to Socket.IO events for live UI updates

## 8) Quick Run Checklist

1. Install deps:
```
cd backend
pip install -r requirements.txt
```

2. Set env vars:
```
export DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/seatiq"
export JWT_SECRET_KEY="replace-this"
export SECRET_KEY="replace-this"
```

3. Run:
```
python app.py
```
