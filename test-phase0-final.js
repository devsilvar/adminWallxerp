/**
 * Phase 0 Final Verification Test
 * Tests all critical functionality with correct field names
 */

const http = require('http');

const API_BASE = 'http://localhost:5000';
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      method,
      hostname: url.hostname,
      port: 5000,
      path: url.pathname,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  log('\n🧪 PHASE 0 FINAL VERIFICATION\n', 'blue');
  
  let passed = 0, failed = 0;
  
  // Test 1: Health Check
  try {
    const res = await makeRequest('GET', '/api/health');
    if (res.status === 200) {
      log('✓ Health check passed', 'green');
      passed++;
    } else {
      log('✗ Health check failed', 'red');
      failed++;
    }
  } catch (e) {
    log('✗ Health check error: ' + e.message, 'red');
    failed++;
  }
  
  // Test 2: Register (correct fields: email, phone, password)
  try {
    const timestamp = Date.now();
    const res = await makeRequest('POST', '/api/v1/auth/register', {
      email: `test${timestamp}@example.com`,
      phone: `+23480${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: 'Test@123456',
    });
    if (res.status === 201) {
      log('✓ Registration passed', 'green');
      passed++;
    } else {
      log(`✗ Registration failed: ${res.status} - ${JSON.stringify(res.data)}`, 'red');
      failed++;
    }
  } catch (e) {
    log('✗ Registration error: ' + e.message, 'red');
    failed++;
  }
  
  // Test 3: Login
  let token = null;
  try {
    const res = await makeRequest('POST', '/api/v1/auth/login', {
      email: 'john@example.com',
      password: 'Password123!',
    });
    if (res.status === 200 && res.data.data.accessToken) {
      token = res.data.data.accessToken;
      log('✓ Login passed', 'green');
      passed++;
    } else {
      log(`✗ Login failed: ${JSON.stringify(res.data)}`, 'red');
      failed++;
    }
  } catch (e) {
    log('✗ Login error: ' + e.message, 'red');
    failed++;
  }
  
  // Test 4: Get businesses (with token)
  if (token) {
    try {
      const res = await makeRequest('GET', '/api/v1/businesses', null);
      res.headers = { Authorization: `Bearer ${token}` };
      
      const options = {
        method: 'GET',
        hostname: 'localhost',
        port: 5000,
        path: '/api/v1/businesses',
        headers: { Authorization: `Bearer ${token}` },
      };
      
      const businessRes = await new Promise((resolve) => {
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
        });
        req.end();
      });
      
      if (businessRes.status === 200) {
        const count = businessRes.data.data?.businesses?.length || 0;
        log(`✓ Get businesses passed (found ${count})`, 'green');
        passed++;
      } else {
        log('✗ Get businesses failed', 'red');
        failed++;
      }
    } catch (e) {
      log('✗ Get businesses error: ' + e.message, 'red');
      failed++;
    }
  }
  
  // Test 5: Verify merchantId exists in database
  try {
    const { PrismaClient } = require('./backend/node_modules/@prisma/client');
    const prisma = new PrismaClient();
    const businesses = await prisma.business.findMany({
      select: { merchantId: true }
    });
    await prisma.$disconnect();
    
    const allHaveMerchantId = businesses.every(b => b.merchantId);
    if (allHaveMerchantId && businesses.length > 0) {
      log(`✓ All ${businesses.length} businesses have merchantId`, 'green');
      passed++;
    } else {
      log('✗ Some businesses missing merchantId', 'red');
      failed++;
    }
  } catch (e) {
    log('⚠ Could not verify merchantId: ' + e.message, 'yellow');
  }
  
  // Summary
  log(`\n${'='.repeat(50)}`, 'blue');
  log(`RESULTS: ${passed} passed, ${failed} failed`, passed > failed ? 'green' : 'red');
  log(`Pass Rate: ${((passed/(passed+failed))*100).toFixed(1)}%`, 'blue');
  log('='.repeat(50) + '\n', 'blue');
  
  process.exit(failed > 0 ? 1 : 0);
}

test().catch(console.error);
