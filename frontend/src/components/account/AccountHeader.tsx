import React from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button.tsx';

export interface AccountHeaderProps {
  businessName: string;
  isActive: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export const AccountHeader: React.FC<AccountHeaderProps> = ({
  businessName,
  isActive,
  isRefreshing,
  onRefresh,
}) => {
  return (
    <div data-testid="account-header" className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">Wallet &amp; Inflows</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Dedicated account for <span className="font-semibold text-gray-800">{businessName}</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          isLoading={isRefreshing}
          subscriptionExempt={true}
          className="text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh
        </Button>
        {isActive && (
          <Link to="/transactions">
            <Button size="sm" variant="secondary" subscriptionExempt={true} className="text-xs">
              Transaction History <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
};

export default AccountHeader;
