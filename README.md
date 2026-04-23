# SeatIQ

SeatIQ is a simple library seat booking system.

Current version focus:
1. Learn backend basics from scratch using Flask.
2. Use an in-memory backend first (no database).
3. Optionally upgrade to PostgreSQL when you are ready.

---

## 1) What You Will Build

User flow:
1. Register with roll number.
2. Select a floor.
3. Select a seat number from 1 to 500.
4. Book the seat.
5. Seat becomes unavailable for others.
6. Release seat later, then it becomes available again.

Floors and seat prefixes:
1. Ground -> G (example G278)
2. First -> F (example F237)
3. Second -> S (example S237)
4. Third -> T (example T237)
5. Fourth -> FO (example FO237)

Capacity:
1. 500 seats per floor
2. Total seats = 2500

---

## 2) Project Structure (Current)

Main active backend file:
1. backend/app.py

Frontend files:
1. frontend/index.html
2. frontend/styles.css
3. frontend/app.js

Note:
1. Other backend files are placeholders right now.
2. Current backend intentionally runs without database for learning speed.

---

## 3) Backend From Scratch (Concept Guide)

This section explains exactly what backend/app.py is teaching you.

### Step A: Create Flask app
1. Import Flask.
2. Create app object.
3. Add /health route to verify server is alive.

### Step B: Define data model in memory
1. users_by_roll: set of registered roll numbers
2. seat_to_roll: mapping seat_id -> roll_no
3. roll_to_seat: mapping roll_no -> seat_id

This replaces a DB at beginner stage.

### Step C: Define seat system rules
1. Floor map with codes G/F/S/T/FO
2. Seat number range 1..500
3. Seat id format = floor code + seat number

### Step D: Build core APIs
1. POST /register
2. GET /floors
3. GET /floors/<floor>/seats
4. POST /bookings
5. POST /bookings/release
6. GET /bookings

### Step E: Add validations
1. roll_no required
2. floor must be valid
3. seat number must be integer in 1..500
4. user must register first
5. one user can have one active seat
6. cannot double-book same seat

### Step F: Add browser support
1. CORS headers are returned from backend.
2. Frontend can call backend on different port.

---

## 4) Setup and Run (macOS-friendly)

### A) Create virtual environment and install backend dependencies

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Why python -m pip?
1. On some macOS setups pip is unavailable directly.
2. Homebrew Python may block global pip installs (PEP 668).
3. Virtual environment avoids that problem.

### B) Start backend

Port 5000 may be busy on macOS, so run on 5001:

```bash
cd backend
source .venv/bin/activate
python -c "from app import app; app.run(host='0.0.0.0', port=5001, debug=True)"
```

Health check:

```bash
curl http://127.0.0.1:5001/health
```

### C) Start frontend

Open a new terminal:

```bash
cd frontend
python3 -m http.server 5500
```

Open in browser:
1. http://127.0.0.1:5500
2. Keep backend URL set to http://127.0.0.1:5001

---

## 5) API Reference (Current In-Memory Backend)

### 1. Register user

Endpoint:
1. POST /register

Request:

```json
{
	"roll_no": "1024030389"
}
```

### 2. List floors with availability

Endpoint:
1. GET /floors

Response fields:
1. floor_name
2. floor_code
3. booked
4. available
5. is_full

### 3. List seats of one floor

Endpoint:
1. GET /floors/<floor>/seats

Examples:
1. /floors/ground/seats
2. /floors/S/seats
3. /floors/second/seats?available_only=true

### 4. Book seat

Endpoint:
1. POST /bookings

Request:

```json
{
	"roll_no": "1024030389",
	"floor": "second",
	"seat_number": 45
}
```

Success response includes:
1. seat_id (example S45)

### 5. Release seat

Endpoint:
1. POST /bookings/release

Request:

```json
{
	"roll_no": "1024030389"
}
```

### 6. List active bookings

Endpoint:
1. GET /bookings

---

## 6) Quick cURL Demo

```bash
# 1) Register
curl -X POST http://127.0.0.1:5001/register \
	-H "Content-Type: application/json" \
	-d '{"roll_no":"1024030389"}'

# 2) Check floors
curl http://127.0.0.1:5001/floors

# 3) Book S45
curl -X POST http://127.0.0.1:5001/bookings \
	-H "Content-Type: application/json" \
	-d '{"roll_no":"1024030389","floor":"second","seat_number":45}'

# 4) See active bookings
curl http://127.0.0.1:5001/bookings

# 5) Release seat
curl -X POST http://127.0.0.1:5001/bookings/release \
	-H "Content-Type: application/json" \
	-d '{"roll_no":"1024030389"}'
```

---

## 7) What In-Memory Means

Current behavior:
1. Fast for learning and demos.
2. Data resets when server restarts.
3. Not suitable for production.

To persist data, use PostgreSQL.

---

## 8) PostgreSQL Upgrade Guide (Complete)

This is the exact roadmap when you want real persistence.

### A) Install PostgreSQL

On macOS (Homebrew):

```bash
brew install postgresql@16
brew services start postgresql@16
```

Create database:

```bash
createdb seatiq
```

### B) Install Python DB packages

In backend virtual environment:

```bash
cd backend
source .venv/bin/activate
python -m pip install SQLAlchemy psycopg[binary] Flask-SQLAlchemy Flask-Migrate
```

### C) Add environment variables

```bash
export DATABASE_URL="postgresql+psycopg://localhost:5432/seatiq"
export SECRET_KEY="replace-this"
```

Optional with username/password:

```bash
export DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/seatiq"
```

### D) Design tables

Minimum recommended schema:
1. users
2. floors
3. seats
4. bookings

Suggested constraints:
1. users.roll_no unique
2. seats.seat_id unique
3. one active booking per seat
4. one active booking per user

### E) Suggested SQL schema (starter)

```sql
CREATE TABLE users (
	id SERIAL PRIMARY KEY,
	roll_no VARCHAR(40) UNIQUE NOT NULL,
	created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE floors (
	id SERIAL PRIMARY KEY,
	name VARCHAR(20) UNIQUE NOT NULL,
	code VARCHAR(5) UNIQUE NOT NULL
);

CREATE TABLE seats (
	id SERIAL PRIMARY KEY,
	floor_id INT NOT NULL REFERENCES floors(id),
	seat_number INT NOT NULL CHECK (seat_number BETWEEN 1 AND 500),
	seat_id VARCHAR(16) UNIQUE NOT NULL,
	UNIQUE(floor_id, seat_number)
);

CREATE TABLE bookings (
	id SERIAL PRIMARY KEY,
	user_id INT NOT NULL REFERENCES users(id),
	seat_id INT NOT NULL REFERENCES seats(id),
	status VARCHAR(20) NOT NULL DEFAULT 'active',
	created_at TIMESTAMPTZ DEFAULT NOW(),
	released_at TIMESTAMPTZ
);
```

### F) Backend code migration strategy

Replace in-memory maps with DB operations:
1. users_by_roll -> users table
2. seat_to_roll -> join of seats and active bookings
3. roll_to_seat -> active booking by user

For booking endpoint, use transaction:
1. Begin transaction
2. Check user exists
3. Lock seat row (SELECT ... FOR UPDATE)
4. Ensure no active booking on seat/user
5. Insert booking
6. Commit

### G) Use Flask-Migrate

```bash
cd backend
source .venv/bin/activate
flask db init
flask db migrate -m "init schema"
flask db upgrade
```

### H) Seed floors and seats

Run once:
1. insert 5 floors: G, F, S, T, FO
2. insert 500 seats per floor

### I) Keep same API contract

Good practice:
1. Keep current endpoints unchanged.
2. Only replace storage layer.
3. Frontend will continue to work without major changes.

---

## 9) Backend Learning Roadmap (From Beginner to Strong)

1. Stage 1: In-memory CRUD and validations (current)
2. Stage 2: PostgreSQL persistence and constraints
3. Stage 3: Auth (JWT), admin roles, protected routes
4. Stage 4: Real-time updates with WebSocket/Socket.IO
5. Stage 5: Automated tests (pytest) and CI pipeline
6. Stage 6: Docker + deployment

---

## 10) Troubleshooting

### pip not found

Use:

```bash
python3 -m pip --version
```

### Externally managed environment (PEP 668)

Use virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

### Port 5000 already in use

Run on 5001:

```bash
python -c "from app import app; app.run(host='0.0.0.0', port=5001, debug=True)"
```

### Frontend cannot call backend

Check:
1. Backend running on 127.0.0.1:5001
2. Frontend backend URL input is correct
3. CORS headers present in backend response

---

## 11) Important Note

The current codebase is intentionally simplified for learning and demos.
For production, move to PostgreSQL and add proper authentication, authorization, and tests.