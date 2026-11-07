import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Clock, XCircle, RefreshCw } from 'lucide-react';
import { useBusinessStore } from '@/stores/business.store';
import { useAuthStore } from '@/stores/auth.store';
import api from '@/lib/axios';
import Button from './ui/Button';

/**
 * DVA Diagnostics Panel
 * 
 * Temporary debugging component to diagnose DVA and transaction issues.
 * Add this to your Dashboard or Account page to see what's happening.
 * 
 * Usage:
 *   import DVADiagnostics from '@/components/DVADiagnostics';
 *   
 *   // Add to your component JSX:
 *   {import.meta.env.DEV && <DVADiagnostics />}
 */

interface DiagnosticResult {
  name: string;
  status: 'success' | 'warning' | 'error' | 'info';
  message: string;
  details?: string;
}

export default function DVADiagnostics() {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);
  const user = useAuthStore((s) => s.user);

  const runDiagnostics = async () => {
    setIsRunning(true);
    const diagnostics: DiagnosticResult[] = [];

    // 1. Check authentication
    const accessToken = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');
    
    if (!accessToken) {
      diagnostics.push({
        name: 'Authentication',
        status: 'error',
        message: 'No access token found',
        details: 'You are not logged in. Please log in again.'
      });
    } else {
      try {
        // Try to decode JWT to check expiration
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        const isExpired = payload.exp * 1000 < Date.now();
        
        diagnostics.push({
          name: 'Authentication',
          status: isExpired ? 'warning' : 'success',
          message: isExpired ? 'Access token expired' : 'Access token valid',
          details: `Expires: ${new Date(payload.exp * 1000).toLocaleString()}`
        });
      } catch {
        diagnostics.push({
          name: 'Authentication',
          status: 'warning',
          message: 'Could not decode token',
          details: 'Token might be malformed'
        });
      }
    }

    if (!refreshToken) {
      diagnostics.push({
        name: 'Refresh Token',
        status: 'warning',
        message: 'No refresh token found',
        details: 'You might be logged out automatically'
      });
    } else {
      diagnostics.push({
        name: 'Refresh Token',
        status: 'success',
        message: 'Refresh token present'
      });
    }

    // 2. Check user data
    if (!user) {
      diagnostics.push({
        name: 'User Data',
        status: 'error',
        message: 'No user data loaded',
        details: 'User store is empty'
      });
    } else {
      diagnostics.push({
        name: 'User Data',
        status: 'success',
        message: `Logged in as ${user.email}`,
        details: `BVN: ${user.bvnVerifiedAt ? '✅ Verified' : '❌ Not verified'}`
      });
    }

    // 3. Check active business
    if (!activeBusiness) {
      diagnostics.push({
        name: 'Active Business',
        status: 'error',
        message: 'No active business selected',
        details: 'Create or select a business'
      });
    } else {
      diagnostics.push({
        name: 'Active Business',
        status: 'success',
        message: activeBusiness.businessName,
        details: `ID: ${activeBusiness.id}`
      });

      // 4. Check DVA status
      try {
        const dvaRes = await api.get(`/businesses/${activeBusiness.id}/dva/virtual-account`);
        const dva = dvaRes.data.data;

        const statusMap = {
          active: 'success',
          pending: 'warning',
          none: 'info',
          failed: 'error'
        } as const;

        diagnostics.push({
          name: 'DVA Status',
          status: statusMap[dva.status as keyof typeof statusMap] || 'info',
          message: `Status: ${dva.status}`,
          details: dva.accountNumber 
            ? `Account: ${dva.accountNumber} (${dva.bankName})`
            : dva.message || 'No account number yet'
        });
      } catch (err: any) {
        diagnostics.push({
          name: 'DVA Status',
          status: 'error',
          message: 'Failed to fetch DVA status',
          details: err.response?.data?.error?.message || err.message
        });
      }

      // 5. Check sales endpoint
      try {
        const salesRes = await api.get(`/businesses/${activeBusiness.id}/sales`, { 
          params: { limit: 5 } 
        });
        const sales = salesRes.data.data || [];

        diagnostics.push({
          name: 'Sales Endpoint',
          status: 'success',
          message: `${sales.length} sales found`,
          details: sales.length > 0 
            ? `Latest: ${sales[0].description || 'Unnamed'} - ₦${Number(sales[0].amount).toLocaleString()}`
            : 'No sales yet'
        });
      } catch (err: any) {
        diagnostics.push({
          name: 'Sales Endpoint',
          status: 'error',
          message: 'Failed to fetch sales',
          details: err.response?.data?.error?.message || err.message
        });
      }

      // 6. Check balance endpoint (the one you're having issues with)
      try {
        const balanceRes = await api.get(`/businesses/${activeBusiness.id}/dva/balance`);
        const balance = balanceRes.data.data;

        diagnostics.push({
          name: 'DVA Balance Endpoint',
          status: 'success',
          message: 'Balance endpoint working',
          details: JSON.stringify(balance, null, 2)
        });
      } catch (err: any) {
        const status = err.response?.status;
        diagnostics.push({
          name: 'DVA Balance Endpoint',
          status: 'error',
          message: `Failed with ${status || 'unknown'} error`,
          details: err.response?.data?.error?.message || err.message
        });
      }

      // 7. Check tax payments endpoint
      try {
        const paymentsRes = await api.get(`/businesses/${activeBusiness.id}/tax/payments`, { 
          params: { limit: 5 } 
        });
        const payments = paymentsRes.data.data || [];

        diagnostics.push({
          name: 'Tax Payments Endpoint',
          status: 'success',
          message: `${payments.length} payments found`,
          details: payments.length > 0 
            ? `Latest: ₦${Number(payments[0].amountPaid).toLocaleString()} (${payments[0].paymentStatus})`
            : 'No payments yet'
        });
      } catch (err: any) {
        diagnostics.push({
          name: 'Tax Payments Endpoint',
          status: 'error',
          message: 'Failed to fetch tax payments',
          details: err.response?.data?.error?.message || err.message
        });
      }
    }

    setResults(diagnostics);
    setIsRunning(false);
  };

  useEffect(() => {
    runDiagnostics();
  }, [activeBusiness?.id, user]);

  const getStatusIcon = (status: DiagnosticResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'info':
        return <Clock className="h-5 w-5 text-blue-500" />;
    }
  };

  const getStatusBg = (status: DiagnosticResult['status']) => {
    switch (status) {
      case 'success':
        return 'bg-emerald-50 border-emerald-200';
      case 'warning':
        return 'bg-amber-50 border-amber-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'info':
        return 'bg-blue-50 border-blue-200';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-h-[600px] overflow-auto rounded-xl border-2 border-gray-200 bg-white shadow-2xl">
      <div className="sticky top-0 bg-gradient-to-r from-primary-600 to-primary-700 px-4 py-3 flex items-center justify-between">
        <h3 className="text-white font-bold text-sm flex items-center gap-2">
          🔍 DVA Diagnostics
        </h3>
        <Button
          size="sm"
          variant="secondary"
          onClick={runDiagnostics}
          disabled={isRunning}
          className="text-xs"
        >
          {isRunning ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </Button>
      </div>

      <div className="p-4 space-y-3">
        {results.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            Running diagnostics...
          </div>
        ) : (
          results.map((result, idx) => (
            <div
              key={idx}
              className={`rounded-lg border-2 p-3 ${getStatusBg(result.status)}`}
            >
              <div className="flex items-start gap-2">
                {getStatusIcon(result.status)}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900">
                    {result.name}
                  </p>
                  <p className="text-xs text-gray-700 mt-0.5">
                    {result.message}
                  </p>
                  {result.details && (
                    <pre className="text-[10px] text-gray-600 mt-2 bg-white/50 rounded px-2 py-1 overflow-auto">
                      {result.details}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="sticky bottom-0 bg-gray-50 px-4 py-2 text-[10px] text-gray-500 border-t border-gray-200">
        💡 This is a debugging panel. Remove before production.
      </div>
    </div>
  );
}
