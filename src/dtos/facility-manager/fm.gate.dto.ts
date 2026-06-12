// ── Responses ─────────────────────────────────────────────────────────────────

export interface GateVisitorProfile {
  inviteId: string;
  visitorName: string;
  visitorPhone: string | null;
  visitorType: string;
  frequency: string;
  status: string;
  scheduledFrom: Date;
  scheduledUntil: Date;
  hostTenant: {
    id: string;
    name: string | null;
    unit: string;
    property: string;
  };
  canCheckIn: boolean;
  canCheckOut: boolean;
  canRequestDeparture: boolean;
  departureRequestPending: boolean;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
}

export interface PinLookupResult {
  ok: boolean;
  profile: GateVisitorProfile | null;
  error: { code: string; message: string } | null;
}
