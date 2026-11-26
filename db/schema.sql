CREATE TABLE IF NOT EXISTS schools (
    udise          TEXT PRIMARY KEY CHECK (udise ~ '^[0-9]{11}$'),
    name           TEXT NOT NULL,
    mandal         TEXT NOT NULL,
    management     TEXT NOT NULL,
    password_hash  TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS schools_name_idx ON schools (name);

CREATE TABLE IF NOT EXISTS admins (
    id             BIGSERIAL PRIMARY KEY,
    username       TEXT UNIQUE NOT NULL,
    name           TEXT NOT NULL,
    password_hash  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
    id                UUID PRIMARY KEY,
    udise             TEXT NOT NULL REFERENCES schools (udise),
    purpose           TEXT NOT NULL CHECK (purpose IN ('tc', 'exam', 'premium')),
    purpose_label     TEXT NOT NULL,
    amount            NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    utr               TEXT NOT NULL,
    txn_id            TEXT,
    paid_by           TEXT NOT NULL,
    payment_app       TEXT NOT NULL,
    paid_at           TIMESTAMPTZ NOT NULL,
    headmaster        TEXT NOT NULL,
    mobile            TEXT NOT NULL,
    qty               INT NOT NULL DEFAULT 1,
    status            TEXT NOT NULL DEFAULT 'Pending'
                      CHECK (status IN ('Pending', 'Verified', 'Rejected')),
    remarks           TEXT NOT NULL DEFAULT '',
    receipt_drive_id  TEXT NOT NULL,
    receipt_mime      TEXT NOT NULL,
    submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at       TIMESTAMPTZ,
    reviewed_by       BIGINT REFERENCES admins (id)
);

-- The same UTR cannot be active twice. A rejected payment can be resubmitted.
CREATE UNIQUE INDEX IF NOT EXISTS payments_utr_active
    ON payments (utr) WHERE status <> 'Rejected';
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS payments_udise_idx  ON payments (udise, submitted_at DESC);

CREATE TABLE IF NOT EXISTS notices (
    id           BIGSERIAL PRIMARY KEY,
    notice_date  TEXT NOT NULL,
    text         TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);
