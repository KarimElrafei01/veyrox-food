// The messaging context's public face. Another context imports only from here —
// published events and public types, never a repository or a use case (ADR-0019).
export { type InboundMessage, type CtaButton, type MessagingChannel } from './messaging-channel.js';
