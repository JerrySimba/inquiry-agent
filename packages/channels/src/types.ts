export type NormalizedInbound = {
  channel: "whatsapp" | "email";
  orgId: string;
  externalThreadId: string;
  customerHandle: string;
  customerName?: string;
  subject?: string;
  body: string;
  externalMessageId?: string;
  channelAccountId?: string;
};
