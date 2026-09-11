/**
 * TODO(backend): order-status has no line items, barista assignment, branch address,
 * or "extraction method" — none of that exists in the data model yet. This is
 * placeholder content matching design 2.9's exact copy so the screen can be built
 * and reviewed now; swap it for real fields (an items array on order-status, a
 * `branch`/`address` column on tenants, staff assignment on accept) when they land.
 */
export const MOCK_OPEN_ORDER_EXTRAS = {
  baristaName: 'Omar',
  extractionNote: 'Hot extraction',
  branchName: 'Zamalek Branch',
  branchAddress: '26th of July St.',
  hoursFooter: 'Barista bar open until 11:30 PM',
  walkFooter: 'Zamalek Island · 3 min walk from Gezira Club',
  items: [
    {
      nameEn: 'Cardamom Cortado',
      detailEn: 'Double shot Baladi blend · Oat milk',
      priceMinor: 8500,
      qty: 1,
    },
    {
      nameEn: 'Mini Baladi Feteer',
      detailEn: 'Clover honey dip · Warm',
      priceMinor: 6000,
      qty: 1,
    },
  ],
};
