import { useState, useEffect } from 'react';
import { Send } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useBusinessStore } from '@/stores/business.store';
import api from '@/lib/axios';
import toast from 'react-hot-toast';
import NoBusinessPrompt from '@/components/NoBusinessPrompt';

interface BusinessWithDVA {
  id: string;
  businessName: string;
  virtualAccountNumber: string;
  virtualAccountBank: string;
  user: { email: string };
}

export default function TestTransferSimulator() {
  const biz = useBusinessStore((s) => s.activeBusiness);
  const [businesses, setBusinesses] = useState<BusinessWithDVA[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [amount, setAmount] = useState('1000');
  const [customerName, setCustomerName] = useState('Test Customer');
  const [narration, setNarration] = useState('Test payment');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchBusinesses();
  }, []);

  useEffect(() => {
    if (biz && !selectedBusinessId) {
      setSelectedBusinessId(biz.id);
    }
  }, [biz]);

  async function fetchBusinesses() {
    try {
      const res = await api.get('/test/businesses-with-dva');
      setBusinesses(res.data.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load businesses');
    }
  }

  async function handleSimulate() {
    if (!selectedBusinessId || !amount) {
      toast.error('Please fill all required fields');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/test/simulate-transfer', {
        businessId: selectedBusinessId,
        amount: parseFloat(amount),
        customerName,
        narration,
      });

      toast.success(res.data.message);
      
      // Reset form
      setAmount('1000');
      setCustomerName('Test Customer');
      setNarration('Test payment');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to simulate transfer');
    } finally {
      setLoading(false);
    }
  }

  const selectedBusiness = businesses.find((b) => b.id === selectedBusinessId);

  if (!biz) return <NoBusinessPrompt />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Test Transfer Simulator</h1>
        <p className="mt-1 text-sm text-gray-500">
          Simulate DVA transfers to test the verification workflow
        </p>
      </div>

      <Card>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target Business
            </label>
            <select
              value={selectedBusinessId}
              onChange={(e) => setSelectedBusinessId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select a business...</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.businessName} ({b.virtualAccountNumber})
                </option>
              ))}
            </select>
            {selectedBusiness && (
              <p className="mt-1 text-xs text-gray-500">
                {selectedBusiness.virtualAccountBank} • {selectedBusiness.user.email}
              </p>
            )}
          </div>

          <Input
            label="Amount (₦)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1000"
            required
          />

          <Input
            label="Customer Name (optional)"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="John Doe"
          />

          <Input
            label="Narration / Purpose (optional)"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            placeholder="Payment for invoice #123"
          />

          <Button
            onClick={handleSimulate}
            disabled={loading || !selectedBusinessId}
            className="w-full"
          >
            <Send className="h-4 w-4 mr-2" />
            {loading ? 'Simulating...' : 'Simulate Transfer'}
          </Button>
        </div>
      </Card>

      <Card className="bg-yellow-50 border-yellow-200">
        <div className="text-sm text-yellow-900">
          <p className="font-medium mb-2">⚠️ Test Environment Only</p>
          <ul className="list-disc list-inside space-y-1 text-yellow-700">
            <li>This endpoint is disabled in production</li>
            <li>Simulated transfers will create unverified transactions</li>
            <li>Check <strong>/sales/unverified</strong> page after simulating</li>
            <li>Verify or reclassify the transaction to complete the test</li>
          </ul>
        </div>
      </Card>

      {selectedBusiness && (
        <Card>
          <h3 className="font-medium text-gray-900 mb-3">Selected Account Details</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600">Account Number:</dt>
              <dd className="font-mono font-medium">{selectedBusiness.virtualAccountNumber}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Bank:</dt>
              <dd className="font-medium">{selectedBusiness.virtualAccountBank}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Business:</dt>
              <dd className="font-medium">{selectedBusiness.businessName}</dd>
            </div>
          </dl>
        </Card>
      )}
    </div>
  );
}
