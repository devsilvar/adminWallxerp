#!/usr/bin/env node

/**
 * Quick Check: Verify Transaction Classifications
 * Run: node verify-classifications-fix.js
 */

const http = require('http');

console.log('🔍 Checking Transaction Classifications Fix...\n');

// Check if backend is running
http.get('http://localhost:3000/api/health', (res) => {
  if (res.statusCode === 200) {
    console.log('✅ Backend is running on localhost:3000');
    
    // Check test endpoint (no auth required)
    http.get('http://localhost:3000/api/v1/test/check-classifications', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log(`\n📊 Classifications Status:`);
          console.log(`   Count: ${json.data.count}`);
          
          if (json.data.count === 0) {
            console.log('\n❌ No classifications found in database!');
            console.log('\n🔧 Fix:');
            console.log('   cd backend');
            console.log('   npm run prisma:seed');
            console.log('\n   OR just seed classifications:');
            console.log('   npx tsx backend/scripts/seed-classifications.ts');
          } else if (json.data.count < 24) {
            console.log(`\n⚠️  Only ${json.data.count} classifications found. Expected 24.`);
            console.log('\n🔧 Fix:');
            console.log('   cd backend');
            console.log('   npx tsx scripts/seed-classifications.ts');
          } else {
            console.log('\n✅ All 24 classifications present!');
            console.log('\n📋 Sample:');
            json.data.sample.forEach(c => {
              console.log(`   - ${c.name} (${c.category})`);
            });
            console.log('\n✅ Fix is working! Try verifying a transaction in the UI.');
          }
        } catch (e) {
          console.error('❌ Error parsing response:', e.message);
        }
      });
    }).on('error', (e) => {
      console.error('\n❌ Failed to check classifications:', e.message);
      console.log('Make sure backend is running: cd backend && npm run dev');
    });
    
  } else {
    console.error('❌ Backend returned status:', res.statusCode);
  }
}).on('error', (e) => {
  console.error('❌ Backend not reachable:', e.message);
  console.log('\n🔧 Fix:');
  console.log('   cd backend');
  console.log('   npm run dev');
});
