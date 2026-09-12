// The identity context's public face (ADR-0019). Four auth realms (customer token, staff
// device+PIN, owner password+TOTP, platform WebAuthn), all custom. The customer-session
// token is pure crypto (HMAC over a signed payload) so it lives in domain/; the other
// realms land here as they are built (S2–S5).
//
// Staff device+PIN verification (ADR-0023) is deliberately partial: mint/verify only,
// ahead of the full S2-S5 realm (enrollment, PIN storage, key rotation). Re-exported under
// its own names because SessionExpired/SessionInvalid would otherwise collide with the
// customer realm's identically-named errors.
export {
  type CustomerSession,
  SessionExpired,
  SessionInvalid,
  mintCustomerSession,
  verifyCustomerSession,
} from './session-token.js';
export {
  type DeviceKind,
  type DeviceSession,
  type PinActionSession,
  type StaffSession,
  SessionExpired as StaffSessionExpired,
  SessionInvalid as StaffSessionInvalid,
  mintDeviceJwt,
  mintPinActionToken,
  verifyDeviceJwt,
  verifyPinActionToken,
  verifyStaffSession,
} from './staff-session.js';
