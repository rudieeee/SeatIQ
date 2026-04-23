from threading import Lock

from flask import Flask, jsonify, request

app = Flask(__name__)


@app.after_request
def add_cors_headers(response):
	response.headers["Access-Control-Allow-Origin"] = "*"
	response.headers["Access-Control-Allow-Headers"] = "Content-Type"
	response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
	return response

# Floor code mapping requested by user.
FLOORS = {
	"ground": "G",
	"first": "F",
	"second": "S",
	"third": "T",
	"fourth": "FO",
}
SEATS_PER_FLOOR = 500

users_by_roll = set()
seat_to_roll = {}
roll_to_seat = {}
state_lock = Lock()


def _normalize_floor(value: str) -> str | None:
	if not value:
		return None
	value = value.strip().lower()
	if value in FLOORS:
		return FLOORS[value]
	for code in FLOORS.values():
		if value == code.lower():
			return code
	return None


def _seat_id(floor_code: str, seat_number: int) -> str:
	return f"{floor_code}{seat_number}"


def _seat_count_by_floor(floor_code: str) -> int:
	prefix_len = len(floor_code)
	count = 0
	for seat_id in seat_to_roll:
		if seat_id.startswith(floor_code):
			number_part = seat_id[prefix_len:]
			if number_part.isdigit() and 1 <= int(number_part) <= SEATS_PER_FLOOR:
				count += 1
	return count


@app.get("/health")
def health():
	return jsonify({"status": "ok", "service": "SeatIQ simple backend"}), 200


@app.post("/register")
def register_user():
	data = request.get_json(silent=True) or {}
	roll_no = str(data.get("roll_no", "")).strip().upper()

	if not roll_no:
		return jsonify({"error": "roll_no is required"}), 400

	with state_lock:
		if roll_no in users_by_roll:
			return jsonify({"message": "user already registered", "roll_no": roll_no}), 200
		users_by_roll.add(roll_no)

	return jsonify({"message": "registered", "roll_no": roll_no}), 201


@app.get("/floors")
def list_floors():
	result = []
	with state_lock:
		for floor_name, floor_code in FLOORS.items():
			booked = _seat_count_by_floor(floor_code)
			available = SEATS_PER_FLOOR - booked
			result.append(
				{
					"floor_name": floor_name,
					"floor_code": floor_code,
					"booked": booked,
					"available": available,
					"is_full": available == 0,
				}
			)

	return jsonify({"floors": result}), 200


@app.get("/floors/<floor>/seats")
def floor_seats(floor: str):
	floor_code = _normalize_floor(floor)
	if not floor_code:
		return jsonify({"error": "invalid floor"}), 400

	available_only = str(request.args.get("available_only", "false")).lower() == "true"
	seats = []

	with state_lock:
		for num in range(1, SEATS_PER_FLOOR + 1):
			seat_id = _seat_id(floor_code, num)
			is_booked = seat_id in seat_to_roll
			if available_only and is_booked:
				continue
			seats.append(
				{
					"seat_id": seat_id,
					"seat_number": num,
					"available": not is_booked,
					"booked_by": seat_to_roll.get(seat_id),
				}
			)

	return jsonify({"floor_code": floor_code, "seats": seats}), 200


@app.post("/bookings")
def book_seat():
	data = request.get_json(silent=True) or {}
	roll_no = str(data.get("roll_no", "")).strip().upper()
	floor_code = _normalize_floor(str(data.get("floor", "")))
	seat_number = data.get("seat_number")

	if not roll_no:
		return jsonify({"error": "roll_no is required"}), 400
	if not floor_code:
		return jsonify({"error": "valid floor is required"}), 400
	if not isinstance(seat_number, int):
		return jsonify({"error": "seat_number must be an integer"}), 400
	if seat_number < 1 or seat_number > SEATS_PER_FLOOR:
		return jsonify({"error": f"seat_number must be between 1 and {SEATS_PER_FLOOR}"}), 400

	seat_id = _seat_id(floor_code, seat_number)

	with state_lock:
		if roll_no not in users_by_roll:
			return jsonify({"error": "register first"}), 400

		if roll_no in roll_to_seat:
			return jsonify(
				{
					"error": "user already has a booked seat",
					"current_seat": roll_to_seat[roll_no],
				}
			), 409

		if _seat_count_by_floor(floor_code) >= SEATS_PER_FLOOR:
			return jsonify({"error": "selected floor is full, choose another floor"}), 409

		if seat_id in seat_to_roll:
			return jsonify({"error": "seat is unavailable"}), 409

		seat_to_roll[seat_id] = roll_no
		roll_to_seat[roll_no] = seat_id

	return jsonify({"message": "seat booked", "roll_no": roll_no, "seat_id": seat_id}), 201


@app.post("/bookings/release")
def release_seat():
	data = request.get_json(silent=True) or {}
	roll_no = str(data.get("roll_no", "")).strip().upper()

	if not roll_no:
		return jsonify({"error": "roll_no is required"}), 400

	with state_lock:
		seat_id = roll_to_seat.get(roll_no)
		if not seat_id:
			return jsonify({"error": "no active booking for this roll_no"}), 404

		del roll_to_seat[roll_no]
		del seat_to_roll[seat_id]

	return jsonify({"message": "seat released", "roll_no": roll_no, "seat_id": seat_id}), 200


@app.get("/bookings")
def list_bookings():
	with state_lock:
		bookings = [{"roll_no": roll, "seat_id": seat} for roll, seat in roll_to_seat.items()]
	return jsonify({"bookings": bookings}), 200


if __name__ == "__main__":
	app.run(host="0.0.0.0", port=5000, debug=True)
