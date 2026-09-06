export interface InboundMessage {
  providerMessageId: string;
  phoneNumberId: string;
  waId: string;
  displayName: string | null;
  text: string | null;
}

export interface CtaButton {
  label: string;
  url: string;
}

/** The application depends on this shape, never on a BSP's payload or send API. */
export interface MessagingChannel {
  sendCtaUrl(input: { to: string; body: string; cta: CtaButton }): Promise<{ providerRef: string }>;
}
