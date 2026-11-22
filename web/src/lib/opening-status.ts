const OPENING_STATUS_KEYS = {
  open: 'open',
  closed: 'closed',
  closedAbnormal: 'closedAbnormal',
  statusUnknown: 'statusUnknown',
  other: 'other',
} as const

export function getOpeningStatusMessageKey(status: string | null | undefined) {
  return status && status in OPENING_STATUS_KEYS
    ? OPENING_STATUS_KEYS[status as keyof typeof OPENING_STATUS_KEYS]
    : undefined
}
