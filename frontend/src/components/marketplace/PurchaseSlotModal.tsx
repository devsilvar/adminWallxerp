import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal.tsx';
import Button from '@/components/ui/Button.tsx';
import {
  Wallet,
  Building2,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  FileText,
  Lock,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useMarketplaceStore } from '@/stores/marketplace.store.ts';

type PurchaseSlotModalProps = {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  currentAllowance: number;
  totalContacts: number;
  onSuccess: (message: string) => void;
};

const SLOT_PRICE_NGN = 2500;

export default function PurchaseSlotModal({
  isOpen,
  onClose,
  businessId,
  currentAllowance,
  totalContacts,
  onSuccess,
}: PurchaseSlotModalProps) {
  const { purchaseSlotsViaWallet, submitSlotProof, getWalletBalance, submitting } =
    useMarketplaceStore();

  const [activeTab, setActiveTab] = useState<'wallet' | 'bank_transfer'>('wallet');
  const [slotCount, setSlotCount] = useState<number>(1);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState<boolean>(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setProofFile(null);
      setSlotCount(1);
      setLoadingBalance(true);
      getWalletBalance()
        .then((bal) => setWalletBalance(bal))
        .catch(() => setWalletBalance(0))
        .finally(() => setLoadingBalance(false));
    }
  }, [isOpen, getWalletBalance]);

  const totalCost = slotCount * SLOT_PRICE_NGN;
  const hasSufficientBalance =
    walletBalance !== null && walletBalance >= totalCost;

  const handleWalletPurchase = async () => {
    setErrorMsg(null);
    try {
      const result = await purchaseSlotsViaWallet(businessId, slotCount);
      const newSlots = result.allowance?.current ?? currentAllowance + slotCount;
      onSuccess(
        `Successfully unlocked ${slotCount} additional showcase slot${
          slotCount > 1 ? 's' : ''
        }! Capacity is now ${newSlots} products.`
      );
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Wallet payment failed';
      setErrorMsg(msg);
    }
  };

  const handleProofSubmission = async () => {
    if (!proofFile) {
      setErrorMsg('Please select a payment receipt (image or PDF) to upload.');
      return;
    }
    setErrorMsg(null);
    try {
      await submitSlotProof(businessId, slotCount, proofFile);
      onSuccess(
        `Payment proof for ${slotCount} slot(s) submitted for moderation review. Your capacity will be updated once approved.`
      );
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit payment proof';
      setErrorMsg(msg);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        setErrorMsg('File size exceeds the 10MB limit.');
        return;
      }
      setProofFile(file);
      setErrorMsg(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Unlock Showcase Capacity"
      subtitle={`Expand active marketplace slots beyond your current ${currentAllowance} slots.`}
      icon={<Lock className="w-5 h-5 text-purple-600" />}
      size="md"
    >
      <div className="space-y-5">
        {/* Evidence banner */}
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3.5 flex items-start gap-3">
          <div className="p-1.5 bg-purple-100 rounded-lg text-purple-700 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-purple-900">
              Validated Buyer Demand
            </p>
            <p className="text-xs text-purple-800 mt-0.5">
              Your listings have generated{' '}
              <strong className="font-semibold text-purple-950">
                {totalContacts} buyer inquiries
              </strong>
              . Expand your catalog to capture more sales.
            </p>
          </div>
        </div>

        {/* Quantity and Price selector */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label
              htmlFor="slot-count-select"
              className="text-xs font-semibold text-gray-700 uppercase tracking-wide"
            >
              Slots to Unlock
            </label>
            <span className="text-xs text-gray-500 font-medium">
              ₦{SLOT_PRICE_NGN.toLocaleString()} / slot
            </span>
          </div>

          <div className="flex items-center gap-3">
            {[1, 2, 3, 5].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setSlotCount(count)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                  slotCount === count
                    ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-purple-300'
                }`}
              >
                +{count} {count === 1 ? 'Slot' : 'Slots'}
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
            <span className="text-xs text-gray-600">Total Investment:</span>
            <span className="text-lg font-bold text-gray-900">
              ₦{totalCost.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Payment Method Tabs */}
        <div>
          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide block mb-2">
            Payment Method
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('wallet')}
              className={`py-2 px-3 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === 'wallet'
                  ? 'bg-white text-purple-700 shadow-sm font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Central Wallet</span>
              <span className="ml-1 px-1.5 py-0.2 bg-purple-100 text-purple-800 text-[10px] rounded font-bold">
                Instant
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bank_transfer')}
              className={`py-2 px-3 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === 'bank_transfer'
                  ? 'bg-white text-purple-700 shadow-sm font-semibold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Bank Transfer</span>
            </button>
          </div>
        </div>

        {/* Tab Content: Wallet */}
        {activeTab === 'wallet' && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Available Wallet Balance</p>
                {loadingBalance ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                    <span className="text-xs text-gray-400">Loading balance...</span>
                  </div>
                ) : (
                  <p className="text-base font-bold text-gray-900 mt-0.5">
                    ₦{(walletBalance ?? 0).toLocaleString()}
                  </p>
                )}
              </div>

              {!loadingBalance && (
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1 ${
                    hasSufficientBalance
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {hasSufficientBalance ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" /> Sufficient
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3" /> Insufficient
                    </>
                  )}
                </span>
              )}
            </div>

            {!loadingBalance && !hasSufficientBalance && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                You need ₦{totalCost.toLocaleString()} to complete this purchase.
                Your available balance is ₦{(walletBalance ?? 0).toLocaleString()}.
                Please fund your wallet via your dedicated virtual account or use the
                Bank Transfer tab below.
              </div>
            )}

            <Button
              variant="primary"
              className="w-full justify-center bg-purple-600 hover:bg-purple-700 text-white"
              onClick={handleWalletPurchase}
              disabled={submitting || loadingBalance || !hasSufficientBalance}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Unlocking Slot...
                </>
              ) : (
                `Pay ₦${totalCost.toLocaleString()} & Unlock Now`
              )}
            </Button>
          </div>
        )}

        {/* Tab Content: Bank Transfer */}
        {activeTab === 'bank_transfer' && (
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-2 text-xs">
              <p className="font-semibold text-gray-800">
                WallX Enterprise Account Details:
              </p>
              <div className="grid grid-cols-2 gap-2 text-gray-600">
                <div>
                  <span className="text-gray-400 block text-[11px]">Bank:</span>
                  <span className="font-medium text-gray-900">Wema Bank</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[11px]">Account Name:</span>
                  <span className="font-medium text-gray-900">WallX Financials Ltd</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[11px]">Account Number:</span>
                  <span className="font-mono font-bold text-purple-700">0123456789</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[11px]">Transfer Reference:</span>
                  <span className="font-mono text-gray-900">
                    SLOT-{businessId.slice(0, 6).toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Proof Upload Area */}
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1.5">
                Upload Payment Receipt (JPG, PNG, PDF max 10MB)
              </label>
              <label className="border-2 border-dashed border-gray-300 hover:border-purple-500 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer bg-white transition-colors">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {proofFile ? (
                  <div className="flex items-center gap-2 text-xs text-purple-800 font-medium">
                    <FileText className="w-5 h-5 text-purple-600" />
                    <span>{proofFile.name}</span>
                    <span className="text-gray-400">
                      ({(proofFile.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                ) : (
                  <div className="text-center">
                    <UploadCloud className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                    <span className="text-xs font-medium text-purple-600">
                      Click to choose receipt
                    </span>
                    <span className="text-xs text-gray-400 block mt-0.5">
                      Screenshot or bank confirmation PDF
                    </span>
                  </div>
                )}
              </label>
            </div>

            <Button
              variant="primary"
              className="w-full justify-center bg-purple-600 hover:bg-purple-700 text-white"
              onClick={handleProofSubmission}
              disabled={submitting || !proofFile}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Submitting Proof...
                </>
              ) : (
                'Submit Proof for Verification'
              )}
            </Button>
          </div>
        )}

        {/* Error notification */}
        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
