/**
 * Maintenance Mode Utility
 * 
 * Checks if the application is in maintenance mode based on the
 * VITE_MAINTENANCE_MODE environment variable.
 */

/**
 * Returns true if maintenance mode is active.
 * 
 * Maintenance mode is controlled via the `VITE_MAINTENANCE_MODE` environment
 * variable. When set to 'true', the entire application displays a holding page
 * instead of normal functionality.
 * 
 * @returns {boolean} true if maintenance mode is enabled
 */
export function isMaintenanceModeActive(): boolean {
  return import.meta.env.VITE_MAINTENANCE_MODE === 'true';
}
