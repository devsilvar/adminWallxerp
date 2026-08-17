// Diagnostic Test for Real-Time Dashboard Updates
// Open browser console and paste this to test the event system

console.log('=== Dashboard Real-Time Updates Diagnostic ===');

// Check if the dashboard store exists
try {
  const dashboardStore = window.__ZUSTAND_DEV_TOOLS_STORES__?.find(s => 
    s.name?.includes('dashboard') || s.getState?.().invalidateDashboard
  );
  
  if (dashboardStore) {
    console.log('✅ Dashboard store found');
    const state = dashboardStore.getState();
    console.log('Current state:', {
      invalidationCounter: state.invalidationCounter,
      lastReason: state.lastReason,
      lastInvalidatedAt: state.lastInvalidatedAt ? new Date(state.lastInvalidatedAt).toISOString() : null
    });
  } else {
    console.error('❌ Dashboard store NOT found - this is the problem!');
    console.log('Available Zustand stores:', window.__ZUSTAND_DEV_TOOLS_STORES__);
  }
} catch (err) {
  console.error('❌ Error accessing dashboard store:', err);
}

// Test manual invalidation
console.log('\n=== Testing Manual Invalidation ===');
console.log('Run this command to manually trigger a dashboard refresh:');
console.log('useDashboardEvents.getState().invalidateDashboard("manual")');

console.log('\n=== Instructions ===');
console.log('1. If store is found: Try creating a sale and watch for console logs');
console.log('2. If store NOT found: Frontend needs to be rebuilt with new code');
console.log('3. Check for "[DashboardEvents] Invalidated:" logs after mutations');
console.log('4. Check for "[Dashboard] Refetching" logs ~500ms after invalidation');
