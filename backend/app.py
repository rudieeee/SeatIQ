from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, get_jwt_identity, jwt_required
from flask_socketio import SocketIO
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
from sqlalchemy import UniqueConstraint, and_, case, func
from werkzeug.security import check_password_hash, generate_password_hash


# App and extensions
load_dotenv()

app = Flask(__name__)

# Use MySQL in production; allow override for local testing if needed.
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://root:root@localhost:3306/seatiq",
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "seatiq-jwt-dev-secret-change-this-value")
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "seatiq-dev-secret-change-this-value")
app.config["RESERVATION_TTL_MINUTES"] = int(os.getenv("RESERVATION_TTL_MINUTES", "15"))
app.config["ADMIN_SETUP_KEY"] = os.getenv("ADMIN_SETUP_KEY", "")

# Keep token identity as string so JWT library validates sub claim type.
app.config["JWT_IDENTITY_CLAIM"] = "sub"

CORS(app, resources={r"/*": {"origins": "*"}})
db = SQLAlchemy(app)
jwt = JWTManager(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")


# Models
class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    student_id = db.Column(db.String(64), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class Floor(db.Model):
    __tablename__ = "floors"

    id = db.Column(db.Integer, primary_key=True)
    number = db.Column(db.Integer, unique=True, nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.String(255), nullable=True)


class Seat(db.Model):
    __tablename__ = "seats"

    id = db.Column(db.Integer, primary_key=True)
    floor_id = db.Column(db.Integer, db.ForeignKey("floors.id", ondelete="CASCADE"), nullable=False, index=True)
    label = db.Column(db.String(24), nullable=False)
    zone = db.Column(db.String(32), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    floor = db.relationship("Floor", backref=db.backref("seats", lazy=True, cascade="all,delete"))

    __table_args__ = (
        UniqueConstraint("floor_id", "label", name="uq_floor_label"),
    )


class Booking(db.Model):
    __tablename__ = "bookings"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    seat_id = db.Column(db.Integer, db.ForeignKey("seats.id", ondelete="CASCADE"), nullable=False, index=True)
    status = db.Column(db.String(24), nullable=False, default="reserved")
    booked_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=True)
    cancelled_at = db.Column(db.DateTime(timezone=True), nullable=True)

    user = db.relationship("User", backref=db.backref("bookings", lazy=True, cascade="all,delete"))
    seat = db.relationship("Seat", backref=db.backref("bookings", lazy=True, cascade="all,delete"))


# Helpers
ACTIVE_BOOKING_STATUSES = {"reserved", "confirmed"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _booking_is_active(booking: Booking) -> bool:
    if booking.status not in ACTIVE_BOOKING_STATUSES:
        return False
    if booking.status == "reserved" and booking.expires_at and booking.expires_at <= _utcnow():
        return False
    return True


def _expire_due_reservations() -> list[int]:
    now = _utcnow()
    expired = (
        Booking.query.filter(
            Booking.status == "reserved",
            Booking.expires_at.isnot(None),
            Booking.expires_at <= now,
        )
        .all()
    )
    if not expired:
        return []

    seat_ids = [b.seat_id for b in expired]
    for booking in expired:
        booking.status = "expired"
        booking.cancelled_at = now

    db.session.commit()

    for seat_id in seat_ids:
        socketio.emit("seat_released", {"seat_id": seat_id})

    return seat_ids


def _public_user(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "student_id": user.student_id,
    }


def _booking_payload(booking: Booking) -> dict:
    seat = booking.seat
    floor = seat.floor
    return {
        "id": booking.id,
        "status": booking.status,
        "seat_label": seat.label,
        "zone": seat.zone,
        "floor_name": floor.name,
        "floor_id": floor.id,
        "booked_at": booking.booked_at.isoformat() if booking.booked_at else None,
        "expires_at": booking.expires_at.isoformat() if booking.expires_at else None,
    }


def _require_admin_setup_key() -> bool:
    configured = app.config.get("ADMIN_SETUP_KEY", "")
    if not configured:
        return False
    return request.headers.get("X-Admin-Key", "") == configured


def _validate_zone(zone: str) -> str:
    normalized = (zone or "").strip().lower()
    if normalized not in {"quiet", "group", "computer"}:
        return "quiet"
    return normalized


# Routes
@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "SeatIQ backend"}), 200


@app.post("/api/auth/register")
def register_user():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", "")).strip()
    student_id = str(payload.get("student_id", payload.get("studentId", ""))).strip().upper()

    if not name:
        return jsonify({"message": "name is required"}), 400
    if "@" not in email:
        return jsonify({"message": "valid email is required"}), 400
    if len(password) < 6:
        return jsonify({"message": "password must be at least 6 characters"}), 400
    if not student_id:
        return jsonify({"message": "student_id is required"}), 400

    if User.query.filter(func.lower(User.email) == email).first():
        return jsonify({"message": "Email already exists"}), 409
    if User.query.filter(func.upper(User.student_id) == student_id).first():
        return jsonify({"message": "Student ID already exists"}), 409

    user = User(
        name=name,
        email=email,
        student_id=student_id,
        password_hash=generate_password_hash(password),
    )
    db.session.add(user)
    db.session.commit()

    token = create_access_token(identity=str(user.id))
    return jsonify({"token": token, "user": _public_user(user)}), 201


@app.post("/api/auth/login")
def login_user():
    payload = request.get_json(silent=True) or {}
    identifier = str(payload.get("email", payload.get("student_id", ""))).strip()
    password = str(payload.get("password", "")).strip()

    if not identifier or not password:
        return jsonify({"message": "email/student_id and password are required"}), 400

    email_guess = identifier.lower()
    user = User.query.filter(func.lower(User.email) == email_guess).first()
    if not user:
        student_guess = identifier.upper()
        user = User.query.filter(func.upper(User.student_id) == student_guess).first()

    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"message": "Invalid credentials"}), 401

    token = create_access_token(identity=str(user.id))
    return jsonify({"token": token, "user": _public_user(user)}), 200


@app.get("/api/floors")
@jwt_required()
def get_floors():
    _expire_due_reservations()

    floors = Floor.query.order_by(Floor.number.asc(), Floor.id.asc()).all()
    if not floors:
        return jsonify([]), 200

    active_status = tuple(ACTIVE_BOOKING_STATUSES)
    stats_rows = (
        db.session.query(
            Seat.floor_id.label("floor_id"),
            func.count(Seat.id).label("total_seats"),
            func.sum(case((Booking.status == "reserved", 1), else_=0)).label("reserved_seats"),
            func.sum(case((Booking.status == "confirmed", 1), else_=0)).label("occupied_seats"),
        )
        .select_from(Seat)
        .outerjoin(
            Booking,
            and_(
                Booking.seat_id == Seat.id,
                Booking.status.in_(active_status),
                func.coalesce(Booking.expires_at, _utcnow() + timedelta(days=3650)) > _utcnow(),
            ),
        )
        .filter(Seat.is_active.is_(True))
        .group_by(Seat.floor_id)
        .all()
    )

    stats_by_floor = {
        row.floor_id: {
            "total": int(row.total_seats or 0),
            "reserved": int(row.reserved_seats or 0),
            "occupied": int(row.occupied_seats or 0),
        }
        for row in stats_rows
    }

    result = []
    for floor in floors:
        stat = stats_by_floor.get(floor.id, {"total": 0, "reserved": 0, "occupied": 0})
        available = stat["total"] - stat["reserved"] - stat["occupied"]
        result.append(
            {
                "id": floor.id,
                "name": floor.name,
                "description": floor.description,
                "number": floor.number,
                "total_seats": stat["total"],
                "available_seats": max(available, 0),
                "occupied_seats": stat["occupied"],
                "reserved_seats": stat["reserved"],
            }
        )

    return jsonify(result), 200


@app.get("/api/floors/<int:floor_id>/seats")
@jwt_required()
def get_floor_seats(floor_id: int):
    _expire_due_reservations()

    floor = Floor.query.get(floor_id)
    if not floor:
        return jsonify({"message": "Floor not found"}), 404

    seats = (
        Seat.query.filter_by(floor_id=floor_id, is_active=True)
        .order_by(Seat.label.asc())
        .all()
    )

    seat_ids = [s.id for s in seats]
    active_bookings = []
    if seat_ids:
        active_bookings = (
            Booking.query.filter(
                Booking.seat_id.in_(seat_ids),
                Booking.status.in_(ACTIVE_BOOKING_STATUSES),
                func.coalesce(Booking.expires_at, _utcnow() + timedelta(days=3650)) > _utcnow(),
            ).all()
        )

    status_by_seat = {}
    for booking in active_bookings:
        status_by_seat[booking.seat_id] = booking.status

    return jsonify(
        [
            {
                "id": seat.id,
                "label": seat.label,
                "zone": seat.zone,
                "status": "available" if seat.id not in status_by_seat else (
                    "reserved" if status_by_seat[seat.id] == "reserved" else "occupied"
                ),
            }
            for seat in seats
        ]
    ), 200


@app.post("/api/bookings")
@jwt_required()
def create_booking():
    _expire_due_reservations()

    user_id = int(get_jwt_identity())
    payload = request.get_json(silent=True) or {}
    seat_id = payload.get("seat_id")

    if seat_id is None:
        return jsonify({"message": "seat_id is required"}), 400

    try:
        seat_id = int(seat_id)
    except (TypeError, ValueError):
        return jsonify({"message": "seat_id must be an integer"}), 400

    existing = (
        Booking.query.filter(
            Booking.user_id == user_id,
            Booking.status.in_(ACTIVE_BOOKING_STATUSES),
            func.coalesce(Booking.expires_at, _utcnow() + timedelta(days=3650)) > _utcnow(),
        )
        .order_by(Booking.id.desc())
        .first()
    )
    if existing:
        return jsonify({"message": "You already have an active booking"}), 409

    seat = Seat.query.filter_by(id=seat_id, is_active=True).first()
    if not seat:
        return jsonify({"message": "Seat not found"}), 404

    seat_active_booking = (
        Booking.query.filter(
            Booking.seat_id == seat_id,
            Booking.status.in_(ACTIVE_BOOKING_STATUSES),
            func.coalesce(Booking.expires_at, _utcnow() + timedelta(days=3650)) > _utcnow(),
        )
        .first()
    )
    if seat_active_booking:
        return jsonify({"message": "Seat is not available"}), 409

    booked_at = _utcnow()
    expires_at = booked_at + timedelta(minutes=app.config["RESERVATION_TTL_MINUTES"])

    booking = Booking(
        user_id=user_id,
        seat_id=seat_id,
        status="reserved",
        booked_at=booked_at,
        expires_at=expires_at,
    )
    db.session.add(booking)
    db.session.commit()

    socketio.emit("seat_reserved", {"seat_id": seat_id})
    return jsonify(_booking_payload(booking)), 201


@app.get("/api/my-booking")
@jwt_required()
def get_my_booking():
    _expire_due_reservations()

    user_id = int(get_jwt_identity())
    booking = (
        Booking.query.filter(
            Booking.user_id == user_id,
            Booking.status.in_(ACTIVE_BOOKING_STATUSES),
            func.coalesce(Booking.expires_at, _utcnow() + timedelta(days=3650)) > _utcnow(),
        )
        .order_by(Booking.id.desc())
        .first()
    )

    if not booking:
        return jsonify(None), 200

    return jsonify(_booking_payload(booking)), 200


@app.delete("/api/bookings/<int:booking_id>")
@jwt_required()
def cancel_booking(booking_id: int):
    user_id = int(get_jwt_identity())

    booking = Booking.query.filter_by(id=booking_id).first()
    if not booking:
        return jsonify({"message": "Booking not found"}), 404
    if booking.user_id != user_id:
        return jsonify({"message": "Forbidden"}), 403
    if booking.status not in ACTIVE_BOOKING_STATUSES:
        return jsonify({"message": "Booking is not active"}), 400

    booking.status = "cancelled"
    booking.cancelled_at = _utcnow()
    db.session.commit()

    socketio.emit("seat_released", {"seat_id": booking.seat_id})
    return jsonify({"message": "Booking cancelled"}), 200


# Optional setup endpoints for first-time real deployment.
@app.post("/api/admin/setup-layout")
def setup_layout():
    if not _require_admin_setup_key():
        return jsonify({"message": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    floors_payload = payload.get("floors", [])
    rows = payload.get("rows", ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"])
    seats_per_row = int(payload.get("seats_per_row", 10))

    if seats_per_row < 1:
        return jsonify({"message": "seats_per_row must be >= 1"}), 400

    if not isinstance(rows, list) or not rows:
        return jsonify({"message": "rows must be a non-empty array"}), 400

    if not isinstance(floors_payload, list) or not floors_payload:
        return jsonify({"message": "floors must be a non-empty array"}), 400

    if Floor.query.count() > 0 or Seat.query.count() > 0:
        return jsonify({"message": "Layout already exists"}), 409

    created_floors = []
    for item in floors_payload:
        number = item.get("number")
        name = str(item.get("name", "")).strip()
        description = str(item.get("description", "")).strip() or None
        if number is None or not name:
            return jsonify({"message": "Each floor needs number and name"}), 400

        floor = Floor(number=int(number), name=name, description=description)
        db.session.add(floor)
        created_floors.append(floor)

    db.session.flush()

    seats_to_add = []
    for floor in created_floors:
        for row_idx, row in enumerate(rows):
            zone = "quiet" if row_idx < 3 else ("group" if row_idx < 7 else "computer")
            for col in range(1, seats_per_row + 1):
                seats_to_add.append(
                    Seat(
                        floor_id=floor.id,
                        label=f"{str(row).upper()}-{col}",
                        zone=_validate_zone(zone),
                        is_active=True,
                    )
                )

    db.session.add_all(seats_to_add)
    db.session.commit()

    return jsonify(
        {
            "message": "Layout created successfully",
            "floors": len(created_floors),
            "seats": len(seats_to_add),
        }
    ), 201


@socketio.on("connect")
def socket_connect(auth):
    # Auth can be validated here later if strict socket authorization is needed.
    return None


@socketio.on("disconnect")
def socket_disconnect():
    return None


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    socketio.run(app, host="0.0.0.0", port=5000, debug=True, allow_unsafe_werkzeug=True)
