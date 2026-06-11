import fetch from 'node-fetch';

async function testCompleteWorkflow() {
  console.log('🧪 COMPLETE BUSINESS API TEST');
  console.log('============================');

  let adminJwt = null;
  let customerId = null;
  let apiKey = null;

  try {
    // 1. Admin login
    console.log('\n1. Admin Login...');
    const adminResponse = await fetch('http://localhost:3000/api/v1/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@yourcompany.com',
        password: 'admin123!CHANGE_THIS'
      })
    });
    
    const adminResult = await adminResponse.json();
    adminJwt = adminResult.data?.token;
    
    if (!adminJwt) {
      console.log('❌ Admin login failed');
      console.log('Response:', adminResult);
      return;
    }
    console.log('✅ Admin JWT:', adminJwt.substring(0, 20) + '…');

    // 2. Create customer
    console.log('\n2. Creating Customer...');
    const customerResponse = await fetch('http://localhost:3000/api/v1/admin/customers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminJwt}`
      },
      body: JSON.stringify({
        email: `testcustomer_${Date.now()}@example.com`,
        company: 'Test Company Ltd',
        plan: 'basic'
      })
    });
    
    const customerResult = await customerResponse.json();
    customerId = customerResult.data?.customer?.id;
    
    if (!customerId) {
      console.log('❌ Customer creation failed');
      console.log('Response:', customerResult);
      return;
    }
    console.log('✅ Customer ID:', customerId);

    // 3. Generate API key
    console.log('\n3. Generating API Key...');
    const keyResponse = await fetch(`http://localhost:3000/api/v1/admin/customers/${customerId}/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminJwt}`
      },
      body: JSON.stringify({
        name: 'Business Search Key',
        permissions: ['business:read', 'business:write']
      })
    });
    
    const keyResult = await keyResponse.json();
    apiKey = keyResult.data?.plainKey;
    
    if (!apiKey) {
      console.log('❌ API key generation failed');
      console.log('Response:', keyResult);
      return;
    }
    console.log('✅ API Key:', apiKey.substring(0, 20) + '…');

    // 4. Test business search with "devcenter"
    console.log('\n4. Testing Business Name Search with "devcenter"...');
    const searchResponse = await fetch('http://localhost:3000/api/v1/name-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${apiKey}`
      },
      body: JSON.stringify({
        SearchType: 'ALL',
        searchTerm: 'devcenter',
        maxResults: 10
      })
    });
    
    const searchResult = await searchResponse.json();
    const success = searchResult.success;
    
    if (success) {
      console.log('🎉 SUCCESS! Business name search works!');
      const processingTime = searchResult.data?.middlewareMetadata?.processingTimeMs;
      console.log('✅ Response time:', processingTime + 'ms');
      const results = searchResult.data?.cacApiResponse?.data || [];
      console.log('✅ Results returned:', results.length);
      console.log('Expected: 2 results');
      console.log('Actual:', results.length, 'results');
      
      if (results.length > 0) {
        console.log('\n📋 Results:');
        results.forEach((result, index) => {
          console.log(`${index + 1}. ${result.name} (RC: ${result.rcNumber || 'N/A'})`);
        });
      }
    } else {
      console.log('❌ Business search failed');
      const errorMsg = searchResult.error?.message;
      console.log('Error:', errorMsg);
      console.log('Full response:', JSON.stringify(searchResult, null, 2));
    }

    // 5. Also test name-search again (single canonical endpoint)
    console.log('\n5. Testing legacy name-search endpoint with "devcenter"...');
    const legacyResponse = await fetch('http://localhost:3000/api/v1/name-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${apiKey}`
      },
      body: JSON.stringify({
        SearchType: 'ALL',
        searchTerm: 'devcenter',
        maxResults: 10
      })
    });
    
    const legacyResult = await legacyResponse.json();
    const legacySuccess = legacyResult.success;
    
    if (legacySuccess) {
      console.log('🎉 LEGACY SUCCESS! Business name search works!');
      const legacyResults = legacyResult.data?.cacApiResponse?.data || [];
      console.log('✅ Legacy Results returned:', legacyResults.length);
      console.log('Expected: 2 results');
      console.log('Actual:', legacyResults.length, 'results');
      
      if (legacyResults.length > 0) {
        console.log('\n📋 Legacy Results:');
        legacyResults.forEach((result, index) => {
          console.log(`${index + 1}. ${result.name} (RC: ${result.rcNumber || 'N/A'})`);
        });
      }
    } else {
      console.log('❌ LEGACY FAILED! Business search failed');
      const errorMsg = legacyResult.error?.message;
      console.log('Error:', errorMsg);
      console.log('Full response:', JSON.stringify(legacyResult, null, 2));
    }

    // 6. Verify token
    console.log('\n6. Verifying Token...');
    const verifyResponse = await fetch('http://localhost:3000/api/v1/admin/debug/verify-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminJwt}`
      },
      body: JSON.stringify({ token: apiKey })
    });
    
    const verifyResult = await verifyResponse.json();
    const match = verifyResult.data?.match;
    
    if (match) {
      console.log('✅ Token verification: MATCH');
    } else {
      console.log('❌ Token verification: NO MATCH');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n🏁 TEST COMPLETE');
  console.log('==================');
  console.log('Summary:');
  console.log('✅ Admin login:', adminJwt ? 'SUCCESS' : 'FAILED');
  console.log('✅ Customer creation:', customerId ? 'SUCCESS' : 'FAILED');
  console.log('✅ API key generation:', apiKey ? 'SUCCESS' : 'FAILED');
  console.log('✅ Business search: Check results above');
  console.log('✅ Token verification: Check results above');
}

testCompleteWorkflow();