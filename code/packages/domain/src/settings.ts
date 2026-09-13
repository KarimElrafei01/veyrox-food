/**
 * A stand-in for `setting_definitions` (ADR-0015 §B), which is not a real
 * table yet (ADR-0024): neither console that would read a shared registry
 * exists, so there is nothing for a live row to serve beyond this file's one
 * caller. This carries exactly the shape a `setting_definitions` row would -
 * so the "described in one sentence, in both languages" discipline ADR-0015
 * demands is honored now, not deferred along with the table. Moving an entry
 * from here into a real seeded row is the whole migration, once Sprint 6-7
 * lands the table for real.
 */
export interface SettingDefinition<T> {
  key: string;
  /** Matches ADR-0015's three layers. Every entry here is 3 today - nothing
   *  configurable this way has a platform kill-switch or a paid entitlement
   *  gate yet (ADR-0024's Alternatives). */
  layer: 1 | 2 | 3;
  defaultValue: T;
  ownerEditable: boolean;
  descriptionEn: string;
  descriptionAr: string;
}

export const KNOWN_SETTINGS = {
  kitchenAutoAccept: {
    key: 'kitchen.auto_accept',
    layer: 3,
    defaultValue: false,
    ownerEditable: true,
    descriptionEn: 'Skip the Accept tap - incoming orders start preparing immediately.',
    descriptionAr: 'تخطي خطوة القبول - تبدأ الطلبات الواردة في التحضير فورًا.',
  } satisfies SettingDefinition<boolean>,
} as const;
