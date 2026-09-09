// The identity context's public face (ADR-0019). Four auth realms (customer token, staff
// device+PIN, owner password+TOTP, platform WebAuthn), all custom. The customer-session
// token is pure crypto (HMAC over a signed payload) so it lives in domain/; the other
// realms land here as they are built (S2–S5).
export {
  type CustomerSession,
  SessionExpired,
  SessionInvalid,
  mintCustomerSession,
  verifyCustomerSession,
} from './session-token.js';
