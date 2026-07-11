/**
 * ETA Calculation Service
 * Simple model: ETA = preparation_time + travel_time
 * travel_time = (distance_km / avg_speed_kmh) * 60 minutes
 */

const DEFAULT_PREP_TIME = 15;    // minutes
const AVG_SPEED_KMH     = 25;    // city average speed
const BASE_DELIVERY_FEE = 30;    // ₹

/**
 * Haversine distance (km)
 */
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

/**
 * Calculate ETA for an order
 * @param {Object} restaurantLocation { lat, lng }
 * @param {Object} deliveryLocation   { lat, lng }
 * @param {Number} prepTime  - preparation time in minutes
 * @returns {{ eta: Number, distance: String, breakdown: Object }}
 */
export const calculateETA = (restaurantLocation, deliveryLocation, prepTime = DEFAULT_PREP_TIME) => {
  const dist = haversineDistance(
    restaurantLocation.lat, restaurantLocation.lng,
    deliveryLocation.lat,   deliveryLocation.lng
  );

  const travelTime   = Math.ceil((dist / AVG_SPEED_KMH) * 60);
  const bufferTime   = Math.ceil(travelTime * 0.15); // 15% buffer for traffic
  const totalETA     = prepTime + travelTime + bufferTime;

  return {
    eta:      totalETA,
    distance: `${dist.toFixed(1)} km`,
    breakdown: {
      preparation:  prepTime,
      travel:       travelTime,
      buffer:       bufferTime,
    },
  };
};

/**
 * Delivery charge calculator
 * ₹30 base + ₹5/km after 2km
 */
export const calculateDeliveryCharge = (distanceKm) => {
  if (distanceKm <= 2) return BASE_DELIVERY_FEE;
  return Math.ceil(BASE_DELIVERY_FEE + (distanceKm - 2) * 5);
};
