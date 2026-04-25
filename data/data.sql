-- =============================================================================
--  LibraSeat — MySQL Schema
--  Compatible with MySQL 8.0+
--  Run:  mysql -u <user> -p <dbname> < schema.sql
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO';

-- =============================================================================
--  TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            CHAR(36)     NOT NULL DEFAULT (UUID()),
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,          -- store bcrypt/argon2 in production
    student_id    VARCHAR(50)  NOT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email      (email),
    UNIQUE KEY uq_users_student_id (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- -----------------------------------------------------------------------------
-- floors
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS floors (
    id          VARCHAR(5)   NOT NULL,      -- '1' to '5'
    number      TINYINT      NOT NULL,      -- 0 = ground, 1 = first, ...
    code        VARCHAR(5)   NOT NULL,      -- 'G', 'F', 'S', 'T', 'FO'
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_floors_number (number),
    UNIQUE KEY uq_floors_code   (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- -----------------------------------------------------------------------------
-- seats
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS seats (
    id          VARCHAR(10)  NOT NULL,      -- e.g. 'G-A1', 'FO-J10'
    label       VARCHAR(10)  NOT NULL,      -- e.g. 'A-1'
    zone        ENUM('quiet','group','computer') NOT NULL,
    floor_id    VARCHAR(5)   NOT NULL,
    is_disabled TINYINT(1)   NOT NULL DEFAULT 0,

    PRIMARY KEY (id),
    KEY idx_seats_floor_id (floor_id),
    KEY idx_seats_zone     (zone),
    CONSTRAINT fk_seats_floor FOREIGN KEY (floor_id) REFERENCES floors (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- -----------------------------------------------------------------------------
-- bookings
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
    id          CHAR(36)    NOT NULL DEFAULT (UUID()),
    user_id     CHAR(36)    NOT NULL,
    seat_id     VARCHAR(10) NOT NULL,
    floor_id    VARCHAR(5)  NOT NULL,
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    released_at DATETIME             DEFAULT NULL,   -- NULL = still active

    PRIMARY KEY (id),
    KEY idx_bookings_user_id    (user_id),
    KEY idx_bookings_seat_id    (seat_id),
    KEY idx_bookings_created_at (created_at),
    CONSTRAINT fk_bookings_user  FOREIGN KEY (user_id)  REFERENCES users  (id) ON DELETE CASCADE,
    CONSTRAINT fk_bookings_seat  FOREIGN KEY (seat_id)  REFERENCES seats  (id) ON DELETE CASCADE,
    CONSTRAINT fk_bookings_floor FOREIGN KEY (floor_id) REFERENCES floors (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- MySQL does not support partial unique indexes, so the
-- "one active booking per user / per seat" rule is enforced
-- by the stored procedures below (before INSERT).


-- =============================================================================
--  VIEWS
-- =============================================================================

-- Floor stats — used by GET /api/floors
CREATE OR REPLACE VIEW v_floor_stats AS
SELECT
    f.id,
    f.number,
    f.code,
    f.name,
    f.description,
    COUNT(s.id)                                                                    AS total_seats,
    COUNT(CASE WHEN s.is_disabled = 0 AND b.id IS NULL THEN 1 END)                AS available_seats,
    COUNT(CASE WHEN b.id IS NOT NULL AND b.released_at IS NULL THEN 1 END)        AS occupied_seats,
    0                                                                              AS reserved_seats,
    CASE
        WHEN COUNT(CASE WHEN s.is_disabled = 0 AND b.id IS NULL THEN 1 END) = 0
        THEN 1 ELSE 0
    END                                                                            AS is_full
FROM floors f
JOIN seats s ON s.floor_id = f.id
LEFT JOIN bookings b
    ON b.seat_id     = s.id
   AND b.released_at IS NULL
GROUP BY f.id, f.number, f.code, f.name, f.description;


-- Seat map — used by GET /api/floors/:id/seats
CREATE OR REPLACE VIEW v_seat_map AS
SELECT
    s.id,
    s.label,
    s.zone,
    s.floor_id,
    CASE
        WHEN s.is_disabled = 1              THEN 'disabled'
        WHEN b.id          IS NOT NULL      THEN 'occupied'
        ELSE                                     'available'
    END                  AS status,
    b.user_id            AS booked_by_user_id
FROM seats s
LEFT JOIN bookings b
    ON b.seat_id     = s.id
   AND b.released_at IS NULL;


-- Active bookings — used by GET /api/my-booking
CREATE OR REPLACE VIEW v_active_bookings AS
SELECT
    bk.id,
    bk.user_id,
    bk.seat_id,
    s.label      AS seat_label,
    s.zone,
    bk.floor_id,
    f.name       AS floor_name,
    f.code       AS floor_code,
    bk.created_at,
    u.name       AS user_name,
    u.student_id
FROM bookings bk
JOIN seats   s ON s.id  = bk.seat_id
JOIN floors  f ON f.id  = bk.floor_id
JOIN users   u ON u.id  = bk.user_id
WHERE bk.released_at IS NULL;


-- =============================================================================
--  STORED PROCEDURES
-- =============================================================================

DROP PROCEDURE IF EXISTS sp_create_booking;
DELIMITER //
CREATE PROCEDURE sp_create_booking (
    IN  p_user_id  CHAR(36),
    IN  p_seat_id  VARCHAR(10),
    IN  p_floor_id VARCHAR(5),
    OUT p_booking_id CHAR(36),
    OUT p_error      VARCHAR(100)
)
BEGIN
    DECLARE v_existing_user INT DEFAULT 0;
    DECLARE v_existing_seat INT DEFAULT 0;

    -- Check user already has an active booking
    SELECT COUNT(*) INTO v_existing_user
    FROM bookings
    WHERE user_id = p_user_id AND released_at IS NULL;

    IF v_existing_user > 0 THEN
        SET p_error = 'user_already_has_booking';
        LEAVE sp_create_booking;
    END IF;

    -- Check seat is already taken
    SELECT COUNT(*) INTO v_existing_seat
    FROM bookings
    WHERE seat_id = p_seat_id AND released_at IS NULL;

    IF v_existing_seat > 0 THEN
        SET p_error = 'seat_already_taken';
        LEAVE sp_create_booking;
    END IF;

    -- All clear — insert
    SET p_booking_id = UUID();
    INSERT INTO bookings (id, user_id, seat_id, floor_id)
    VALUES (p_booking_id, p_user_id, p_seat_id, p_floor_id);

    SET p_error = NULL;
END //
DELIMITER ;


DROP PROCEDURE IF EXISTS sp_cancel_booking;
DELIMITER //
CREATE PROCEDURE sp_cancel_booking (
    IN  p_booking_id CHAR(36),
    IN  p_user_id    CHAR(36),
    OUT p_seat_id    VARCHAR(10),
    OUT p_error      VARCHAR(100)
)
BEGIN
    SELECT seat_id INTO p_seat_id
    FROM bookings
    WHERE id = p_booking_id AND user_id = p_user_id AND released_at IS NULL;

    IF p_seat_id IS NULL THEN
        SET p_error = 'booking_not_found';
    ELSE
        UPDATE bookings
           SET released_at = NOW()
         WHERE id = p_booking_id;
        SET p_error = NULL;
    END IF;
END //
DELIMITER ;


-- =============================================================================
--  SEED DATA
-- =============================================================================

-- Floors
INSERT IGNORE INTO floors (id, number, code, name, description) VALUES
    ('1', 0, 'G',  'GROUND FLOOR',  'General reading area - Open 24/7'),
    ('2', 1, 'F',  'FIRST FLOOR',   'Quiet zone - No talking'),
    ('3', 2, 'S',  'SECOND FLOOR',  'Computer lab - Group study'),
    ('4', 3, 'T',  'THIRD FLOOR',   'Research and reference section'),
    ('5', 4, 'FO', 'FOURTH FLOOR',  'Silent study - Postgraduate only');

-- Seats (500 total: 5 floors x 10 rows [A-J] x 10 cols)
-- Zone assignment: rows A-C = quiet | rows D-G = group | rows H-J = computer

INSERT INTO seats (id, label, zone, floor_id, is_disabled) VALUES
  ('G-A1', 'A-1', 'quiet', '1', 0),
  ('G-A2', 'A-2', 'quiet', '1', 0),
  ('G-A3', 'A-3', 'quiet', '1', 0),
  ('G-A4', 'A-4', 'quiet', '1', 0),
  ('G-A5', 'A-5', 'quiet', '1', 0),
  ('G-A6', 'A-6', 'quiet', '1', 0),
  ('G-A7', 'A-7', 'quiet', '1', 0),
  ('G-A8', 'A-8', 'quiet', '1', 0),
  ('G-A9', 'A-9', 'quiet', '1', 0),
  ('G-A10', 'A-10', 'quiet', '1', 0),
  ('G-B1', 'B-1', 'quiet', '1', 0),
  ('G-B2', 'B-2', 'quiet', '1', 0),
  ('G-B3', 'B-3', 'quiet', '1', 0),
  ('G-B4', 'B-4', 'quiet', '1', 0),
  ('G-B5', 'B-5', 'quiet', '1', 0),
  ('G-B6', 'B-6', 'quiet', '1', 0),
  ('G-B7', 'B-7', 'quiet', '1', 0),
  ('G-B8', 'B-8', 'quiet', '1', 0),
  ('G-B9', 'B-9', 'quiet', '1', 0),
  ('G-B10', 'B-10', 'quiet', '1', 0),
  ('G-C1', 'C-1', 'quiet', '1', 0),
  ('G-C2', 'C-2', 'quiet', '1', 0),
  ('G-C3', 'C-3', 'quiet', '1', 0),
  ('G-C4', 'C-4', 'quiet', '1', 0),
  ('G-C5', 'C-5', 'quiet', '1', 0),
  ('G-C6', 'C-6', 'quiet', '1', 0),
  ('G-C7', 'C-7', 'quiet', '1', 0),
  ('G-C8', 'C-8', 'quiet', '1', 0),
  ('G-C9', 'C-9', 'quiet', '1', 0),
  ('G-C10', 'C-10', 'quiet', '1', 0),
  ('G-D1', 'D-1', 'group', '1', 0),
  ('G-D2', 'D-2', 'group', '1', 0),
  ('G-D3', 'D-3', 'group', '1', 0),
  ('G-D4', 'D-4', 'group', '1', 0),
  ('G-D5', 'D-5', 'group', '1', 0),
  ('G-D6', 'D-6', 'group', '1', 0),
  ('G-D7', 'D-7', 'group', '1', 0),
  ('G-D8', 'D-8', 'group', '1', 0),
  ('G-D9', 'D-9', 'group', '1', 0),
  ('G-D10', 'D-10', 'group', '1', 0),
  ('G-E1', 'E-1', 'group', '1', 0),
  ('G-E2', 'E-2', 'group', '1', 0),
  ('G-E3', 'E-3', 'group', '1', 0),
  ('G-E4', 'E-4', 'group', '1', 0),
  ('G-E5', 'E-5', 'group', '1', 0),
  ('G-E6', 'E-6', 'group', '1', 0),
  ('G-E7', 'E-7', 'group', '1', 0),
  ('G-E8', 'E-8', 'group', '1', 0),
  ('G-E9', 'E-9', 'group', '1', 0),
  ('G-E10', 'E-10', 'group', '1', 0);

INSERT INTO seats (id, label, zone, floor_id, is_disabled) VALUES
  ('G-F1', 'F-1', 'group', '1', 0),
  ('G-F2', 'F-2', 'group', '1', 0),
  ('G-F3', 'F-3', 'group', '1', 0),
  ('G-F4', 'F-4', 'group', '1', 0),
  ('G-F5', 'F-5', 'group', '1', 0),
  ('G-F6', 'F-6', 'group', '1', 0),
  ('G-F7', 'F-7', 'group', '1', 0),
  ('G-F8', 'F-8', 'group', '1', 0),
  ('G-F9', 'F-9', 'group', '1', 0),
  ('G-F10', 'F-10', 'group', '1', 0),
  ('G-G1', 'G-1', 'group', '1', 0),
  ('G-G2', 'G-2', 'group', '1', 0),
  ('G-G3', 'G-3', 'group', '1', 0),
  ('G-G4', 'G-4', 'group', '1', 0),
  ('G-G5', 'G-5', 'group', '1', 0),
  ('G-G6', 'G-6', 'group', '1', 0),
  ('G-G7', 'G-7', 'group', '1', 0),
  ('G-G8', 'G-8', 'group', '1', 0),
  ('G-G9', 'G-9', 'group', '1', 0),
  ('G-G10', 'G-10', 'group', '1', 0),
  ('G-H1', 'H-1', 'computer', '1', 0),
  ('G-H2', 'H-2', 'computer', '1', 0),
  ('G-H3', 'H-3', 'computer', '1', 0),
  ('G-H4', 'H-4', 'computer', '1', 0),
  ('G-H5', 'H-5', 'computer', '1', 0),
  ('G-H6', 'H-6', 'computer', '1', 0),
  ('G-H7', 'H-7', 'computer', '1', 0),
  ('G-H8', 'H-8', 'computer', '1', 0),
  ('G-H9', 'H-9', 'computer', '1', 0),
  ('G-H10', 'H-10', 'computer', '1', 0),
  ('G-I1', 'I-1', 'computer', '1', 0),
  ('G-I2', 'I-2', 'computer', '1', 0),
  ('G-I3', 'I-3', 'computer', '1', 0),
  ('G-I4', 'I-4', 'computer', '1', 0),
  ('G-I5', 'I-5', 'computer', '1', 0),
  ('G-I6', 'I-6', 'computer', '1', 0),
  ('G-I7', 'I-7', 'computer', '1', 0),
  ('G-I8', 'I-8', 'computer', '1', 0),
  ('G-I9', 'I-9', 'computer', '1', 0),
  ('G-I10', 'I-10', 'computer', '1', 0),
  ('G-J1', 'J-1', 'computer', '1', 0),
  ('G-J2', 'J-2', 'computer', '1', 0),
  ('G-J3', 'J-3', 'computer', '1', 0),
  ('G-J4', 'J-4', 'computer', '1', 0),
  ('G-J5', 'J-5', 'computer', '1', 0),
  ('G-J6', 'J-6', 'computer', '1', 0),
  ('G-J7', 'J-7', 'computer', '1', 0),
  ('G-J8', 'J-8', 'computer', '1', 0),
  ('G-J9', 'J-9', 'computer', '1', 0),
  ('G-J10', 'J-10', 'computer', '1', 0);

INSERT INTO seats (id, label, zone, floor_id, is_disabled) VALUES
  ('F-A1', 'A-1', 'quiet', '2', 0),
  ('F-A2', 'A-2', 'quiet', '2', 0),
  ('F-A3', 'A-3', 'quiet', '2', 0),
  ('F-A4', 'A-4', 'quiet', '2', 0),
  ('F-A5', 'A-5', 'quiet', '2', 0),
  ('F-A6', 'A-6', 'quiet', '2', 0),
  ('F-A7', 'A-7', 'quiet', '2', 0),
  ('F-A8', 'A-8', 'quiet', '2', 0),
  ('F-A9', 'A-9', 'quiet', '2', 0),
  ('F-A10', 'A-10', 'quiet', '2', 0),
  ('F-B1', 'B-1', 'quiet', '2', 0),
  ('F-B2', 'B-2', 'quiet', '2', 0),
  ('F-B3', 'B-3', 'quiet', '2', 0),
  ('F-B4', 'B-4', 'quiet', '2', 0),
  ('F-B5', 'B-5', 'quiet', '2', 0),
  ('F-B6', 'B-6', 'quiet', '2', 0),
  ('F-B7', 'B-7', 'quiet', '2', 0),
  ('F-B8', 'B-8', 'quiet', '2', 0),
  ('F-B9', 'B-9', 'quiet', '2', 0),
  ('F-B10', 'B-10', 'quiet', '2', 0),
  ('F-C1', 'C-1', 'quiet', '2', 0),
  ('F-C2', 'C-2', 'quiet', '2', 0),
  ('F-C3', 'C-3', 'quiet', '2', 0),
  ('F-C4', 'C-4', 'quiet', '2', 0),
  ('F-C5', 'C-5', 'quiet', '2', 0),
  ('F-C6', 'C-6', 'quiet', '2', 0),
  ('F-C7', 'C-7', 'quiet', '2', 0),
  ('F-C8', 'C-8', 'quiet', '2', 0),
  ('F-C9', 'C-9', 'quiet', '2', 0),
  ('F-C10', 'C-10', 'quiet', '2', 0),
  ('F-D1', 'D-1', 'group', '2', 0),
  ('F-D2', 'D-2', 'group', '2', 0),
  ('F-D3', 'D-3', 'group', '2', 0),
  ('F-D4', 'D-4', 'group', '2', 0),
  ('F-D5', 'D-5', 'group', '2', 0),
  ('F-D6', 'D-6', 'group', '2', 0),
  ('F-D7', 'D-7', 'group', '2', 0),
  ('F-D8', 'D-8', 'group', '2', 0),
  ('F-D9', 'D-9', 'group', '2', 0),
  ('F-D10', 'D-10', 'group', '2', 0),
  ('F-E1', 'E-1', 'group', '2', 0),
  ('F-E2', 'E-2', 'group', '2', 0),
  ('F-E3', 'E-3', 'group', '2', 0),
  ('F-E4', 'E-4', 'group', '2', 0),
  ('F-E5', 'E-5', 'group', '2', 0),
  ('F-E6', 'E-6', 'group', '2', 0),
  ('F-E7', 'E-7', 'group', '2', 0),
  ('F-E8', 'E-8', 'group', '2', 0),
  ('F-E9', 'E-9', 'group', '2', 0),
  ('F-E10', 'E-10', 'group', '2', 0);

INSERT INTO seats (id, label, zone, floor_id, is_disabled) VALUES
  ('F-F1', 'F-1', 'group', '2', 0),
  ('F-F2', 'F-2', 'group', '2', 0),
  ('F-F3', 'F-3', 'group', '2', 0),
  ('F-F4', 'F-4', 'group', '2', 0),
  ('F-F5', 'F-5', 'group', '2', 0),
  ('F-F6', 'F-6', 'group', '2', 0),
  ('F-F7', 'F-7', 'group', '2', 0),
  ('F-F8', 'F-8', 'group', '2', 0),
  ('F-F9', 'F-9', 'group', '2', 0),
  ('F-F10', 'F-10', 'group', '2', 0),
  ('F-G1', 'G-1', 'group', '2', 0),
  ('F-G2', 'G-2', 'group', '2', 0),
  ('F-G3', 'G-3', 'group', '2', 0),
  ('F-G4', 'G-4', 'group', '2', 0),
  ('F-G5', 'G-5', 'group', '2', 0),
  ('F-G6', 'G-6', 'group', '2', 0),
  ('F-G7', 'G-7', 'group', '2', 0),
  ('F-G8', 'G-8', 'group', '2', 0),
  ('F-G9', 'G-9', 'group', '2', 0),
  ('F-G10', 'G-10', 'group', '2', 0),
  ('F-H1', 'H-1', 'computer', '2', 0),
  ('F-H2', 'H-2', 'computer', '2', 0),
  ('F-H3', 'H-3', 'computer', '2', 0),
  ('F-H4', 'H-4', 'computer', '2', 0),
  ('F-H5', 'H-5', 'computer', '2', 0),
  ('F-H6', 'H-6', 'computer', '2', 0),
  ('F-H7', 'H-7', 'computer', '2', 0),
  ('F-H8', 'H-8', 'computer', '2', 0),
  ('F-H9', 'H-9', 'computer', '2', 0),
  ('F-H10', 'H-10', 'computer', '2', 0),
  ('F-I1', 'I-1', 'computer', '2', 0),
  ('F-I2', 'I-2', 'computer', '2', 0),
  ('F-I3', 'I-3', 'computer', '2', 0),
  ('F-I4', 'I-4', 'computer', '2', 0),
  ('F-I5', 'I-5', 'computer', '2', 0),
  ('F-I6', 'I-6', 'computer', '2', 0),
  ('F-I7', 'I-7', 'computer', '2', 0),
  ('F-I8', 'I-8', 'computer', '2', 0),
  ('F-I9', 'I-9', 'computer', '2', 0),
  ('F-I10', 'I-10', 'computer', '2', 0),
  ('F-J1', 'J-1', 'computer', '2', 0),
  ('F-J2', 'J-2', 'computer', '2', 0),
  ('F-J3', 'J-3', 'computer', '2', 0),
  ('F-J4', 'J-4', 'computer', '2', 0),
  ('F-J5', 'J-5', 'computer', '2', 0),
  ('F-J6', 'J-6', 'computer', '2', 0),
  ('F-J7', 'J-7', 'computer', '2', 0),
  ('F-J8', 'J-8', 'computer', '2', 0),
  ('F-J9', 'J-9', 'computer', '2', 0),
  ('F-J10', 'J-10', 'computer', '2', 0);

INSERT INTO seats (id, label, zone, floor_id, is_disabled) VALUES
  ('S-A1', 'A-1', 'quiet', '3', 0),
  ('S-A2', 'A-2', 'quiet', '3', 0),
  ('S-A3', 'A-3', 'quiet', '3', 0),
  ('S-A4', 'A-4', 'quiet', '3', 0),
  ('S-A5', 'A-5', 'quiet', '3', 0),
  ('S-A6', 'A-6', 'quiet', '3', 0),
  ('S-A7', 'A-7', 'quiet', '3', 0),
  ('S-A8', 'A-8', 'quiet', '3', 0),
  ('S-A9', 'A-9', 'quiet', '3', 0),
  ('S-A10', 'A-10', 'quiet', '3', 0),
  ('S-B1', 'B-1', 'quiet', '3', 0),
  ('S-B2', 'B-2', 'quiet', '3', 0),
  ('S-B3', 'B-3', 'quiet', '3', 0),
  ('S-B4', 'B-4', 'quiet', '3', 0),
  ('S-B5', 'B-5', 'quiet', '3', 0),
  ('S-B6', 'B-6', 'quiet', '3', 0),
  ('S-B7', 'B-7', 'quiet', '3', 0),
  ('S-B8', 'B-8', 'quiet', '3', 0),
  ('S-B9', 'B-9', 'quiet', '3', 0),
  ('S-B10', 'B-10', 'quiet', '3', 0),
  ('S-C1', 'C-1', 'quiet', '3', 0),
  ('S-C2', 'C-2', 'quiet', '3', 0),
  ('S-C3', 'C-3', 'quiet', '3', 0),
  ('S-C4', 'C-4', 'quiet', '3', 0),
  ('S-C5', 'C-5', 'quiet', '3', 0),
  ('S-C6', 'C-6', 'quiet', '3', 0),
  ('S-C7', 'C-7', 'quiet', '3', 0),
  ('S-C8', 'C-8', 'quiet', '3', 0),
  ('S-C9', 'C-9', 'quiet', '3', 0),
  ('S-C10', 'C-10', 'quiet', '3', 0),
  ('S-D1', 'D-1', 'group', '3', 0),
  ('S-D2', 'D-2', 'group', '3', 0),
  ('S-D3', 'D-3', 'group', '3', 0),
  ('S-D4', 'D-4', 'group', '3', 0),
  ('S-D5', 'D-5', 'group', '3', 0),
  ('S-D6', 'D-6', 'group', '3', 0),
  ('S-D7', 'D-7', 'group', '3', 0),
  ('S-D8', 'D-8', 'group', '3', 0),
  ('S-D9', 'D-9', 'group', '3', 0),
  ('S-D10', 'D-10', 'group', '3', 0),
  ('S-E1', 'E-1', 'group', '3', 0),
  ('S-E2', 'E-2', 'group', '3', 0),
  ('S-E3', 'E-3', 'group', '3', 0),
  ('S-E4', 'E-4', 'group', '3', 0),
  ('S-E5', 'E-5', 'group', '3', 0),
  ('S-E6', 'E-6', 'group', '3', 0),
  ('S-E7', 'E-7', 'group', '3', 0),
  ('S-E8', 'E-8', 'group', '3', 0),
  ('S-E9', 'E-9', 'group', '3', 0),
  ('S-E10', 'E-10', 'group', '3', 0);

INSERT INTO seats (id, label, zone, floor_id, is_disabled) VALUES
  ('S-F1', 'F-1', 'group', '3', 0),
  ('S-F2', 'F-2', 'group', '3', 0),
  ('S-F3', 'F-3', 'group', '3', 0),
  ('S-F4', 'F-4', 'group', '3', 0),
  ('S-F5', 'F-5', 'group', '3', 0),
  ('S-F6', 'F-6', 'group', '3', 0),
  ('S-F7', 'F-7', 'group', '3', 0),
  ('S-F8', 'F-8', 'group', '3', 0),
  ('S-F9', 'F-9', 'group', '3', 0),
  ('S-F10', 'F-10', 'group', '3', 0),
  ('S-G1', 'G-1', 'group', '3', 0),
  ('S-G2', 'G-2', 'group', '3', 0),
  ('S-G3', 'G-3', 'group', '3', 0),
  ('S-G4', 'G-4', 'group', '3', 0),
  ('S-G5', 'G-5', 'group', '3', 0),
  ('S-G6', 'G-6', 'group', '3', 0),
  ('S-G7', 'G-7', 'group', '3', 0),
  ('S-G8', 'G-8', 'group', '3', 0),
  ('S-G9', 'G-9', 'group', '3', 0),
  ('S-G10', 'G-10', 'group', '3', 0),
  ('S-H1', 'H-1', 'computer', '3', 0),
  ('S-H2', 'H-2', 'computer', '3', 0),
  ('S-H3', 'H-3', 'computer', '3', 0),
  ('S-H4', 'H-4', 'computer', '3', 0),
  ('S-H5', 'H-5', 'computer', '3', 0),
  ('S-H6', 'H-6', 'computer', '3', 0),
  ('S-H7', 'H-7', 'computer', '3', 0),
  ('S-H8', 'H-8', 'computer', '3', 0),
  ('S-H9', 'H-9', 'computer', '3', 0),
  ('S-H10', 'H-10', 'computer', '3', 0),
  ('S-I1', 'I-1', 'computer', '3', 0),
  ('S-I2', 'I-2', 'computer', '3', 0),
  ('S-I3', 'I-3', 'computer', '3', 0),
  ('S-I4', 'I-4', 'computer', '3', 0),
  ('S-I5', 'I-5', 'computer', '3', 0),
  ('S-I6', 'I-6', 'computer', '3', 0),
  ('S-I7', 'I-7', 'computer', '3', 0),
  ('S-I8', 'I-8', 'computer', '3', 0),
  ('S-I9', 'I-9', 'computer', '3', 0),
  ('S-I10', 'I-10', 'computer', '3', 0),
  ('S-J1', 'J-1', 'computer', '3', 0),
  ('S-J2', 'J-2', 'computer', '3', 0),
  ('S-J3', 'J-3', 'computer', '3', 0),
  ('S-J4', 'J-4', 'computer', '3', 0),
  ('S-J5', 'J-5', 'computer', '3', 0),
  ('S-J6', 'J-6', 'computer', '3', 0),
  ('S-J7', 'J-7', 'computer', '3', 0),
  ('S-J8', 'J-8', 'computer', '3', 0),
  ('S-J9', 'J-9', 'computer', '3', 0),
  ('S-J10', 'J-10', 'computer', '3', 0);

INSERT INTO seats (id, label, zone, floor_id, is_disabled) VALUES
  ('T-A1', 'A-1', 'quiet', '4', 0),
  ('T-A2', 'A-2', 'quiet', '4', 0),
  ('T-A3', 'A-3', 'quiet', '4', 0),
  ('T-A4', 'A-4', 'quiet', '4', 0),
  ('T-A5', 'A-5', 'quiet', '4', 0),
  ('T-A6', 'A-6', 'quiet', '4', 0),
  ('T-A7', 'A-7', 'quiet', '4', 0),
  ('T-A8', 'A-8', 'quiet', '4', 0),
  ('T-A9', 'A-9', 'quiet', '4', 0),
  ('T-A10', 'A-10', 'quiet', '4', 0),
  ('T-B1', 'B-1', 'quiet', '4', 0),
  ('T-B2', 'B-2', 'quiet', '4', 0),
  ('T-B3', 'B-3', 'quiet', '4', 0),
  ('T-B4', 'B-4', 'quiet', '4', 0),
  ('T-B5', 'B-5', 'quiet', '4', 0),
  ('T-B6', 'B-6', 'quiet', '4', 0),
  ('T-B7', 'B-7', 'quiet', '4', 0),
  ('T-B8', 'B-8', 'quiet', '4', 0),
  ('T-B9', 'B-9', 'quiet', '4', 0),
  ('T-B10', 'B-10', 'quiet', '4', 0),
  ('T-C1', 'C-1', 'quiet', '4', 0),
  ('T-C2', 'C-2', 'quiet', '4', 0),
  ('T-C3', 'C-3', 'quiet', '4', 0),
  ('T-C4', 'C-4', 'quiet', '4', 0),
  ('T-C5', 'C-5', 'quiet', '4', 0),
  ('T-C6', 'C-6', 'quiet', '4', 0),
  ('T-C7', 'C-7', 'quiet', '4', 0),
  ('T-C8', 'C-8', 'quiet', '4', 0),
  ('T-C9', 'C-9', 'quiet', '4', 0),
  ('T-C10', 'C-10', 'quiet', '4', 0),
  ('T-D1', 'D-1', 'group', '4', 0),
  ('T-D2', 'D-2', 'group', '4', 0),
  ('T-D3', 'D-3', 'group', '4', 0),
  ('T-D4', 'D-4', 'group', '4', 0),
  ('T-D5', 'D-5', 'group', '4', 0),
  ('T-D6', 'D-6', 'group', '4', 0),
  ('T-D7', 'D-7', 'group', '4', 0),
  ('T-D8', 'D-8', 'group', '4', 0),
  ('T-D9', 'D-9', 'group', '4', 0),
  ('T-D10', 'D-10', 'group', '4', 0),
  ('T-E1', 'E-1', 'group', '4', 0),
  ('T-E2', 'E-2', 'group', '4', 0),
  ('T-E3', 'E-3', 'group', '4', 0),
  ('T-E4', 'E-4', 'group', '4', 0),
  ('T-E5', 'E-5', 'group', '4', 0),
  ('T-E6', 'E-6', 'group', '4', 0),
  ('T-E7', 'E-7', 'group', '4', 0),
  ('T-E8', 'E-8', 'group', '4', 0),
  ('T-E9', 'E-9', 'group', '4', 0),
  ('T-E10', 'E-10', 'group', '4', 0);

INSERT INTO seats (id, label, zone, floor_id, is_disabled) VALUES
  ('T-F1', 'F-1', 'group', '4', 0),
  ('T-F2', 'F-2', 'group', '4', 0),
  ('T-F3', 'F-3', 'group', '4', 0),
  ('T-F4', 'F-4', 'group', '4', 0),
  ('T-F5', 'F-5', 'group', '4', 0),
  ('T-F6', 'F-6', 'group', '4', 0),
  ('T-F7', 'F-7', 'group', '4', 0),
  ('T-F8', 'F-8', 'group', '4', 0),
  ('T-F9', 'F-9', 'group', '4', 0),
  ('T-F10', 'F-10', 'group', '4', 0),
  ('T-G1', 'G-1', 'group', '4', 0),
  ('T-G2', 'G-2', 'group', '4', 0),
  ('T-G3', 'G-3', 'group', '4', 0),
  ('T-G4', 'G-4', 'group', '4', 0),
  ('T-G5', 'G-5', 'group', '4', 0),
  ('T-G6', 'G-6', 'group', '4', 0),
  ('T-G7', 'G-7', 'group', '4', 0),
  ('T-G8', 'G-8', 'group', '4', 0),
  ('T-G9', 'G-9', 'group', '4', 0),
  ('T-G10', 'G-10', 'group', '4', 0),
  ('T-H1', 'H-1', 'computer', '4', 0),
  ('T-H2', 'H-2', 'computer', '4', 0),
  ('T-H3', 'H-3', 'computer', '4', 0),
  ('T-H4', 'H-4', 'computer', '4', 0),
  ('T-H5', 'H-5', 'computer', '4', 0),
  ('T-H6', 'H-6', 'computer', '4', 0),
  ('T-H7', 'H-7', 'computer', '4', 0),
  ('T-H8', 'H-8', 'computer', '4', 0),
  ('T-H9', 'H-9', 'computer', '4', 0),
  ('T-H10', 'H-10', 'computer', '4', 0),
  ('T-I1', 'I-1', 'computer', '4', 0),
  ('T-I2', 'I-2', 'computer', '4', 0),
  ('T-I3', 'I-3', 'computer', '4', 0),
  ('T-I4', 'I-4', 'computer', '4', 0),
  ('T-I5', 'I-5', 'computer', '4', 0),
  ('T-I6', 'I-6', 'computer', '4', 0),
  ('T-I7', 'I-7', 'computer', '4', 0),
  ('T-I8', 'I-8', 'computer', '4', 0),
  ('T-I9', 'I-9', 'computer', '4', 0),
  ('T-I10', 'I-10', 'computer', '4', 0),
  ('T-J1', 'J-1', 'computer', '4', 0),
  ('T-J2', 'J-2', 'computer', '4', 0),
  ('T-J3', 'J-3', 'computer', '4', 0),
  ('T-J4', 'J-4', 'computer', '4', 0),
  ('T-J5', 'J-5', 'computer', '4', 0),
  ('T-J6', 'J-6', 'computer', '4', 0),
  ('T-J7', 'J-7', 'computer', '4', 0),
  ('T-J8', 'J-8', 'computer', '4', 0),
  ('T-J9', 'J-9', 'computer', '4', 0),
  ('T-J10', 'J-10', 'computer', '4', 0);

INSERT INTO seats (id, label, zone, floor_id, is_disabled) VALUES
  ('FO-A1', 'A-1', 'quiet', '5', 0),
  ('FO-A2', 'A-2', 'quiet', '5', 0),
  ('FO-A3', 'A-3', 'quiet', '5', 0),
  ('FO-A4', 'A-4', 'quiet', '5', 0),
  ('FO-A5', 'A-5', 'quiet', '5', 0),
  ('FO-A6', 'A-6', 'quiet', '5', 0),
  ('FO-A7', 'A-7', 'quiet', '5', 0),
  ('FO-A8', 'A-8', 'quiet', '5', 0),
  ('FO-A9', 'A-9', 'quiet', '5', 0),
  ('FO-A10', 'A-10', 'quiet', '5', 0),
  ('FO-B1', 'B-1', 'quiet', '5', 0),
  ('FO-B2', 'B-2', 'quiet', '5', 0),
  ('FO-B3', 'B-3', 'quiet', '5', 0),
  ('FO-B4', 'B-4', 'quiet', '5', 0),
  ('FO-B5', 'B-5', 'quiet', '5', 0),
  ('FO-B6', 'B-6', 'quiet', '5', 0),
  ('FO-B7', 'B-7', 'quiet', '5', 0),
  ('FO-B8', 'B-8', 'quiet', '5', 0),
  ('FO-B9', 'B-9', 'quiet', '5', 0),
  ('FO-B10', 'B-10', 'quiet', '5', 0),
  ('FO-C1', 'C-1', 'quiet', '5', 0),
  ('FO-C2', 'C-2', 'quiet', '5', 0),
  ('FO-C3', 'C-3', 'quiet', '5', 0),
  ('FO-C4', 'C-4', 'quiet', '5', 0),
  ('FO-C5', 'C-5', 'quiet', '5', 0),
  ('FO-C6', 'C-6', 'quiet', '5', 0),
  ('FO-C7', 'C-7', 'quiet', '5', 0),
  ('FO-C8', 'C-8', 'quiet', '5', 0),
  ('FO-C9', 'C-9', 'quiet', '5', 0),
  ('FO-C10', 'C-10', 'quiet', '5', 0),
  ('FO-D1', 'D-1', 'group', '5', 0),
  ('FO-D2', 'D-2', 'group', '5', 0),
  ('FO-D3', 'D-3', 'group', '5', 0),
  ('FO-D4', 'D-4', 'group', '5', 0),
  ('FO-D5', 'D-5', 'group', '5', 0),
  ('FO-D6', 'D-6', 'group', '5', 0),
  ('FO-D7', 'D-7', 'group', '5', 0),
  ('FO-D8', 'D-8', 'group', '5', 0),
  ('FO-D9', 'D-9', 'group', '5', 0),
  ('FO-D10', 'D-10', 'group', '5', 0),
  ('FO-E1', 'E-1', 'group', '5', 0),
  ('FO-E2', 'E-2', 'group', '5', 0),
  ('FO-E3', 'E-3', 'group', '5', 0),
  ('FO-E4', 'E-4', 'group', '5', 0),
  ('FO-E5', 'E-5', 'group', '5', 0),
  ('FO-E6', 'E-6', 'group', '5', 0),
  ('FO-E7', 'E-7', 'group', '5', 0),
  ('FO-E8', 'E-8', 'group', '5', 0),
  ('FO-E9', 'E-9', 'group', '5', 0),
  ('FO-E10', 'E-10', 'group', '5', 0);

INSERT INTO seats (id, label, zone, floor_id, is_disabled) VALUES
  ('FO-F1', 'F-1', 'group', '5', 0),
  ('FO-F2', 'F-2', 'group', '5', 0),
  ('FO-F3', 'F-3', 'group', '5', 0),
  ('FO-F4', 'F-4', 'group', '5', 0),
  ('FO-F5', 'F-5', 'group', '5', 0),
  ('FO-F6', 'F-6', 'group', '5', 0),
  ('FO-F7', 'F-7', 'group', '5', 0),
  ('FO-F8', 'F-8', 'group', '5', 0),
  ('FO-F9', 'F-9', 'group', '5', 0),
  ('FO-F10', 'F-10', 'group', '5', 0),
  ('FO-G1', 'G-1', 'group', '5', 0),
  ('FO-G2', 'G-2', 'group', '5', 0),
  ('FO-G3', 'G-3', 'group', '5', 0),
  ('FO-G4', 'G-4', 'group', '5', 0),
  ('FO-G5', 'G-5', 'group', '5', 0),
  ('FO-G6', 'G-6', 'group', '5', 0),
  ('FO-G7', 'G-7', 'group', '5', 0),
  ('FO-G8', 'G-8', 'group', '5', 0),
  ('FO-G9', 'G-9', 'group', '5', 0),
  ('FO-G10', 'G-10', 'group', '5', 0),
  ('FO-H1', 'H-1', 'computer', '5', 0),
  ('FO-H2', 'H-2', 'computer', '5', 0),
  ('FO-H3', 'H-3', 'computer', '5', 0),
  ('FO-H4', 'H-4', 'computer', '5', 0),
  ('FO-H5', 'H-5', 'computer', '5', 0),
  ('FO-H6', 'H-6', 'computer', '5', 0),
  ('FO-H7', 'H-7', 'computer', '5', 0),
  ('FO-H8', 'H-8', 'computer', '5', 0),
  ('FO-H9', 'H-9', 'computer', '5', 0),
  ('FO-H10', 'H-10', 'computer', '5', 0),
  ('FO-I1', 'I-1', 'computer', '5', 0),
  ('FO-I2', 'I-2', 'computer', '5', 0),
  ('FO-I3', 'I-3', 'computer', '5', 0),
  ('FO-I4', 'I-4', 'computer', '5', 0),
  ('FO-I5', 'I-5', 'computer', '5', 0),
  ('FO-I6', 'I-6', 'computer', '5', 0),
  ('FO-I7', 'I-7', 'computer', '5', 0),
  ('FO-I8', 'I-8', 'computer', '5', 0),
  ('FO-I9', 'I-9', 'computer', '5', 0),
  ('FO-I10', 'I-10', 'computer', '5', 0),
  ('FO-J1', 'J-1', 'computer', '5', 0),
  ('FO-J2', 'J-2', 'computer', '5', 0),
  ('FO-J3', 'J-3', 'computer', '5', 0),
  ('FO-J4', 'J-4', 'computer', '5', 0),
  ('FO-J5', 'J-5', 'computer', '5', 0),
  ('FO-J6', 'J-6', 'computer', '5', 0),
  ('FO-J7', 'J-7', 'computer', '5', 0),
  ('FO-J8', 'J-8', 'computer', '5', 0),
  ('FO-J9', 'J-9', 'computer', '5', 0),
  ('FO-J10', 'J-10', 'computer', '5', 0);


SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
--  QUICK VERIFICATION QUERIES  (run manually after import)
-- =============================================================================
-- SELECT COUNT(*) FROM floors;         -- expected: 5
-- SELECT COUNT(*) FROM seats;          -- expected: 500
-- SELECT * FROM v_floor_stats;         -- live seat counts per floor
-- SELECT * FROM v_seat_map WHERE floor_id = '1' LIMIT 10;