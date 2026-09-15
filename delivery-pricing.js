/* Afandi UAE delivery pricing. Staged only: not loaded by the live checkout.
 * Geographic straight-line radius, NOT driving-route distance.
 * Owner policy: <=5 km AED5; >5 to <=10 km AED10; >10 km AED15, uncapped distance.
 * Incomplete or invalid location data never becomes a fabricated fee or nearest branch.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AfandiDeliveryPricing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const EARTH_RADIUS_KM = 6371.0088;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  function validPoint(point) {
    return !!point && finite(point.lat) && finite(point.lng)
      && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
  }
  function feeForDistanceKm(km) {
    if (!finite(km) || km < 0) throw new RangeError('A non-negative finite distance is required');
    return km <= 5 ? 5 : km <= 10 ? 10 : 15;
  }
  function distanceKm(a, b) {
    if (!validPoint(a) || !validPoint(b)) throw new RangeError('Two valid geographic points are required');
    const radians = degrees => degrees * Math.PI / 180;
    const dlat = radians(b.lat - a.lat), dlng = radians(b.lng - a.lng);
    const h = Math.sin(dlat / 2) ** 2
      + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dlng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
  }
  function quote({ mode, customer, branch }) {
    if (mode === 'Takeaway' || mode === 'Dine-in') return { status: 'ready', feeAED: 0, distanceKm: null };
    if (mode !== 'Delivery') return { status: 'needs_order_type', feeAED: null };
    if (!validPoint(customer)) return { status: 'needs_customer_location', feeAED: null };
    if (!branch || branch.verified !== true || !validPoint(branch)) return { status: 'needs_verified_branch_location', feeAED: null };
    const distance = distanceKm(customer, branch);
    return { status: 'ready', branchId: branch.id, feeAED: feeForDistanceKm(distance), distanceKm: distance, basis: 'geographic-radius' };
  }
  function nearestBranch(customer, branches) {
    if (!validPoint(customer)) return { status: 'needs_customer_location', branch: null };
    // Never call one of two known points the nearest of all five branches.
    if (!Array.isArray(branches) || !branches.length || branches.some(b => !b || b.verified !== true || !validPoint(b))) {
      return { status: 'needs_verified_branch_locations', branch: null };
    }
    const ranked = branches.map(branch => ({ branch, distanceKm: distanceKm(customer, branch) }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    return { status: 'ready', ...ranked[0] };
  }
  return Object.freeze({ feeForDistanceKm, distanceKm, quote, nearestBranch });
});
