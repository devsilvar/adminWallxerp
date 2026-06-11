#!/usr/bin/env node

/**
 * DVA Webhook Test Script
 * 
 * Simulates a Paystack DVA transfer webhook to test end-to-end flow.
 * 
 * Usage:
 *   node test-dva-webhook.js <ngrok-url> [dva-account-number]
 * 
 * Example:
 *   node test-dva-webhook.js https://abc123.ngrok.io 9900000000
 */

const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env file
const envPath = path.join(__dirname, 'backend', '.env');
let SECRET_KEY = 'sk_test_mock';

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/PAYSTACK_SECRET_KEY=(.+)/);
  if (match) SECRET_KEY = match[1].trim();
}

// Parse arguments
const ngrokUrl = process.argv[2];
const dvaAccountNumber = process.argv[3] || '9900000000';

if (!ngrokUrl) {
  console.error('Usage: node test-dva-webhook.js <ngrok-url> [dva-account-number]');
  console.error('Example: node test-dva-webhook.js https://abc123.ngrok.io 9900000000');
  process.exit(1);
}

const reference = `test-dva-${Date.now()}`;
const amount = 500000; // ₦5000 in kobo

const payload = JSON.stringify({
  event: 'charge.success',
  data: {
    reference,
    amount,
    channel: 'dedicated_nuban',
    paid_at: new Date().toISOString(),
    status: 'success',
    currency: 'NGN',
    dedicated_account: {
      account_number: dvaAccountNumber,
      account_name: 'Test Shop/WALLX',
      bank_code: '035',
      bank_name: 'Wema Bank'
    },
    customer: {
      first_name: 'Test',
      last_name: 'Customer',
      email: 'test@example.com',
      customer_code: 'CUS_test123'
    },
    metadata: {
      custom_fields: []
    }
  }
});

// Compute signature
const signature = crypto
  .createHmac('sha512', SECRET_KEY)
  .update(payload)
  .digest('hex');

console.log('📤 Sending DVA webhook...');
console.log(`   URL: ${ngrokUrl}/api/webhooks/paystack`);
console.log(`   Reference: ${reference}`);
console.log(`   Amount: ₦${amount / 100}`);
console.log(`   DVA Account: ${dvaAccountNumber}`);
console.log(`   Signature: ${signature.substring(0, 20)}...`);
console.log('');

const url = new URL(`${ngrokUrl}/api/webhooks/paystack`);
const options = {
  hostname: url.hostname,
  port: url.port || 443,
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-paystack-signature': signature,
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = https.request(options, (res) => {
  console.log(`✅ Response Status: ${res.statusCode}`);
  
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    if (body) {
      try {
        console.log('📥 Response:', JSON.stringify(JSON.parse(body), null, 2));
      } catch {
        console.log('📥 Response:', body);
      }
    }
    
    if (res.statusCode === 200) {
      console.log('');
      console.log('✅ SUCCESS! Webhook processed.');
      console.log('');
      console.log('Next steps:');
      console.log('1. Check backend logs for webhook processing');
      console.log('2. Query unverified sales endpoint');
      console.log('3. Verify the sale (simulate owner confirmation)');
    } else if (res.statusCode === 401) {
      console.log('');
      console.log('❌ SIGNATURE VERIFICATION FAILED');
      console.log('   Check that PAYSTACK_SECRET_KEY in backend/.env matches the key used here');
    } else {
      console.log('');
      console.log(`⚠️  Unexpected status: ${res.statusCode}`);
    }
  });
});

req.on('error', (err) => {
  console.error('❌ Request Error:', err.message);
  console.log('');
  console.log('Troubleshooting:');
  console.log('- Is ngrok running? (ngrok http 3000)');
  console.log('- Is the backend server running? (npm run dev)');
  console.log('- Is the ngrok URL correct?');
  process.exit(1);
});

req.write(payload);
req.end();
