#!/bin/bash

# DVA API Testing Script
# Usage: ./test-dva-api.sh <AUTH_TOKEN>

set -e

# Configuration
API_BASE="https://paymy-tax.onrender.com/api/v1"
BUSINESS_ID="0ca4c440-5358-4ac6-923c-71317014baf7"
AUTH_TOKEN="${1:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if auth token is provided
if [ -z "$AUTH_TOKEN" ]; then
  echo -e "${RED}❌ Error: No auth token provided${NC}"
  echo -e "${YELLOW}Usage: ./test-dva-api.sh <AUTH_TOKEN>${NC}"
  echo ""
  echo "Get your token by:"
  echo "1. Login to https://paymy-tax.onrender.com"
  echo "2. Open browser DevTools (F12)"
  echo "3. Console tab, run: localStorage.getItem('token')"
  exit 1
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🧪 DVA API Testing Script${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Test 1: Get Virtual Account
echo -e "${YELLOW}📋 Test 1: Get Virtual Account${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  "$API_BASE/businesses/$BUSINESS_ID/dva/virtual-account")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Status: $HTTP_CODE${NC}"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  
  # Extract account number
  ACCOUNT=$(echo "$BODY" | grep -o '"accountNumber":"[^"]*"' | cut -d'"' -f4)
  BANK=$(echo "$BODY" | grep -o '"bankName":"[^"]*"' | cut -d'"' -f4)
  
  if [ -n "$ACCOUNT" ]; then
    echo ""
    echo -e "${GREEN}✅ DVA Active${NC}"
    echo -e "   Account: ${GREEN}$ACCOUNT${NC}"
    echo -e "   Bank: ${GREEN}$BANK${NC}"
  fi
else
  echo -e "${RED}❌ Status: $HTTP_CODE${NC}"
  echo "$BODY"
fi

echo ""

# Test 2: Get Unverified Transactions
echo -e "${YELLOW}📋 Test 2: Unverified Transactions${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  "$API_BASE/businesses/$BUSINESS_ID/sales/unverified")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Status: $HTTP_CODE${NC}"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  
  # Count unverified
  COUNT=$(echo "$BODY" | grep -o '"id"' | wc -l)
  
  if [ "$COUNT" -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}⚠️  Found $COUNT unverified transaction(s)${NC}"
    echo -e "${YELLOW}💡 Verify them to include in monthly summary${NC}"
  else
    echo ""
    echo -e "${GREEN}✅ No unverified transactions${NC}"
  fi
else
  echo -e "${RED}❌ Status: $HTTP_CODE${NC}"
  echo "$BODY"
fi

echo ""

# Test 3: Get All Sales
echo -e "${YELLOW}📋 Test 3: All Sales Transactions${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  "$API_BASE/businesses/$BUSINESS_ID/sales?limit=10")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Status: $HTTP_CODE${NC}"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  
  # Count by status
  PENDING=$(echo "$BODY" | grep -o '"status":"pending"' | wc -l)
  CONFIRMED=$(echo "$BODY" | grep -o '"status":"confirmed"' | wc -l)
  
  echo ""
  echo -e "   ⏳ Pending: $PENDING"
  echo -e "   ✅ Confirmed: $CONFIRMED"
else
  echo -e "${RED}❌ Status: $HTTP_CODE${NC}"
  echo "$BODY"
fi

echo ""

# Test 4: Monthly Summary
echo -e "${YELLOW}📋 Test 4: Monthly Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Get current month and year
MONTH=$(date +%m | sed 's/^0*//')
YEAR=$(date +%Y)

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  "$API_BASE/businesses/$BUSINESS_ID/sales/summary?month=$MONTH&year=$YEAR")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Status: $HTTP_CODE${NC}"
  echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
  
  # Extract summary data
  TOTAL=$(echo "$BODY" | grep -o '"totalSales":[0-9.]*' | cut -d':' -f2)
  COUNT=$(echo "$BODY" | grep -o '"transactionCount":[0-9]*' | cut -d':' -f2)
  
  echo ""
  echo -e "   Month: $YEAR-$(printf "%02d" $MONTH)"
  echo -e "   Total Sales: ${GREEN}₦$TOTAL${NC}"
  echo -e "   Transactions: $COUNT"
else
  echo -e "${RED}❌ Status: $HTTP_CODE${NC}"
  echo "$BODY"
fi

echo ""

# Summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Testing Complete${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}💡 Next Steps:${NC}"
echo "   • Make a test transfer to your DVA account"
echo "   • Check unverified transactions"
echo "   • Verify pending transactions"
echo "   • Check summary again"
echo ""
echo -e "${YELLOW}📖 For detailed testing guide, see TESTING_GUIDE.md${NC}"
