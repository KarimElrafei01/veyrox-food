-- uuid v7 — time-ordered primary keys so indexes stay dense (docs/04 §2).
-- Postgres 18 ships uuidv7() natively; this is the interim implementation for
-- Postgres 16 (ADR-0002). Widely-used snippet: millisecond timestamp in the high
-- 48 bits, random elsewhere, version/variant bits forced.
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid
AS $$
BEGIN
  RETURN encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
          FROM 1 FOR 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
END
$$
LANGUAGE plpgsql
VOLATILE;
