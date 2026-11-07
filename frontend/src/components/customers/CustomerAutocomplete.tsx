import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, UserPlus, X, CreditCard, ChevronDown, Loader2, Users, Pencil } from 'lucide-react';
import { useCustomerStore } from '@/stores/customer.store.ts';
import PhoneInput from '@/components/ui/PhoneInput.tsx';
import Button from '@/components/ui/Button.tsx';
import toast from 'react-hot-toast';
import type { Customer } from '@/types/index.ts';

interface CustomerAutocompleteProps {
  businessId: string;
  selectedCustomer: Customer | null;
  onSelectCustomer: (customer: Customer | null) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  showCardBalance?: boolean;
}

export default function CustomerAutocomplete({
  businessId,
  selectedCustomer,
  onSelectCustomer,
  label = 'Customer (Phone or Name)',
  placeholder = 'Search by name or phone…  •  tap to see all',
  required = false,
  showCardBalance = true,
}: CustomerAutocompleteProps) {
  const { customers, loading, searchCustomers, quickCreateCustomer } = useCustomerStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('+234');
  const [newEmail, setNewEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce searchTerm → debouncedTerm (300ms). Keeps typing snappy,
  // avoids spamming the API on every keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedTerm(searchTerm.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchTerm]);

  // Fetch when dropdown opens or debounced term changes.
  // Empty term = show all (up to limit 20) — beginner can just tap and pick.
  useEffect(() => {
    if (!businessId || !isOpen || showQuickAdd) return;
    // Small guard: don't fire on first mount when closed.
    searchCustomers(businessId, debouncedTerm || undefined);
  }, [businessId, debouncedTerm, isOpen, showQuickAdd, searchCustomers]);

  // When dropdown opens with empty search, ensure we have all customers
  // immediately (no debounce wait) — tap → see all.
  useEffect(() => {
    if (isOpen && !showQuickAdd && debouncedTerm === '' && searchTerm === '') {
      searchCustomers(businessId, undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowQuickAdd(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (customer: Customer) => {
    onSelectCustomer(customer);
    setSearchTerm('');
    setDebouncedTerm('');
    setIsOpen(false);
    setShowQuickAdd(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectCustomer(null);
    setSearchTerm('');
    setDebouncedTerm('');
    // keep dropdown open so they can pick another immediately
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error('Customer name is required');
      return;
    }
    if (!newPhone || newPhone.replace(/\D/g, '').length < 10) {
      toast.error('A valid phone number is required');
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await quickCreateCustomer(businessId, {
        name: newName.trim(),
        phone: newPhone.trim(),
        email: newEmail.trim() || undefined,
      });
      toast.success(`Customer ${created.name} added!`);
      handleSelect(created);
      setNewName('');
      setNewPhone('+234');
      setNewEmail('');
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Failed to add customer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const headerText = useMemo(() => {
    if (loading) return 'Searching…';
    if (debouncedTerm) return `Results for “${debouncedTerm}” • ${customers.length}`;
    return `All customers • ${customers.length}`;
  }, [loading, debouncedTerm, customers.length]);

  return (
    <div className="relative" ref={containerRef}>
      {label && (
        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Selected — rich, obvious, one-tap to change */}
      {selectedCustomer ? (
        <div className="flex items-center justify-between p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
              {selectedCustomer.name.charAt(0).toUpperCase()}
            </div>
            <div className="truncate">
              <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
                {selectedCustomer.name}
              </div>
              <div className="text-[11px] text-gray-600 dark:text-gray-400 flex flex-wrap items-center gap-1.5">
                <span>{selectedCustomer.phone || 'No phone'}</span>
                {showCardBalance && selectedCustomer.card && (
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-300 bg-white dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded-full text-[10px]">
                    <CreditCard className="w-3 h-3" />
                    ₦{Number(selectedCustomer.card.balance).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </span>
                )}
                {showCardBalance && !selectedCustomer.card && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700">
                    No voucher yet
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              title="Change customer"
            >
              <Pencil className="w-3 h-3" />
              Change
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelectCustomer(null); setSearchTerm(''); }}
              className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-full hover:bg-white dark:hover:bg-gray-900 transition-colors"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <div
            onClick={() => { setIsOpen(true); setTimeout(()=> inputRef.current?.focus(), 0); }}
            className="flex items-center w-full px-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl text-sm cursor-pointer focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500 transition-all shadow-sm"
          >
            <Search className="w-4 h-4 text-gray-400 mr-2.5 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              className="w-full bg-transparent border-none p-0 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
              placeholder={placeholder}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setSearchTerm(''); setDebouncedTerm(''); inputRef.current?.focus(); }}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1 ml-2 shrink-0 text-[11px] font-medium text-gray-500 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-1 rounded-full">
                <Users className="w-3 h-3" />
                Tap to see all
              </span>
            )}
            <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 ml-1.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
          {/* Helper for total beginner */}
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 px-1">
            Type a name or phone, or just tap to browse all customers.
          </p>
        </div>
      )}

      {/* Dropdown */}
      {isOpen && !selectedCustomer && (
        <div className="absolute z-50 left-0 right-0 mt-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[22rem]">
          {/* Header — tells beginner what they're seeing */}
          <div className="px-3 py-2 bg-gray-50/80 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">
              {headerText}
            </span>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              {loading ? '' : `${customers.length} found`}
            </span>
          </div>

          {!showQuickAdd ? (
            <>
              <div className="overflow-y-auto flex-1 divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  <div className="flex flex-col items-center justify-center p-6 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                    <span className="text-xs text-gray-500">Searching customers…</span>
                    <span className="text-[11px] text-gray-400">Shows all when search is empty</span>
                  </div>
                ) : customers.length === 0 ? (
                  <div className="p-6 text-center">
                    <div className="mx-auto w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-2">
                      <Users className="w-5 h-5 text-gray-400" />
                    </div>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      {debouncedTerm ? `No match for “${debouncedTerm}”` : 'No customers yet'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {debouncedTerm ? 'Try a different name or phone, or add them below.' : 'Add your first customer to get started.'}
                    </p>
                  </div>
                ) : (
                  customers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelect(c)}
                      className="w-full text-left p-3 hover:bg-emerald-50/70 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors group"
                    >
                      <div className="w-9 h-9 rounded-full bg-gray-900 dark:bg-gray-700 text-white flex items-center justify-center font-bold text-sm shrink-0 group-hover:bg-emerald-600 transition-colors">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {c.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {c.phone || 'No phone'} {c.email ? `• ${c.email}` : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        {c.card ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-2 py-1 rounded-full">
                            <CreditCard className="w-3 h-3" />
                            ₦{Number(c.card.balance).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded-full border border-gray-200 dark:border-gray-700">
                            No voucher
                          </span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="p-2.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40">
                <button
                  type="button"
                  onClick={() => {
                    setShowQuickAdd(true);
                    if (debouncedTerm) {
                      if (/^\+?\d+$/.test(debouncedTerm.replace(/\s/g, ''))) {
                        setNewPhone(debouncedTerm);
                      } else {
                        setNewName(debouncedTerm);
                      }
                    }
                    if (searchTerm && !debouncedTerm) {
                      if (/^\+?\d+$/.test(searchTerm.replace(/\s/g, ''))) {
                        setNewPhone(searchTerm);
                      } else {
                        setNewName(searchTerm);
                      }
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-emerald-700 dark:text-emerald-300 bg-white dark:bg-gray-900 border border-emerald-200 dark:border-emerald-800 rounded-full hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors shadow-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  Quick-Add Customer
                </button>
                <p className="text-center text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">
                  Can’t find them? Add in 10 seconds.
                </p>
              </div>
            </>
          ) : (
            <form onSubmit={handleQuickAddSubmit} className="p-4 space-y-3 bg-gray-50/50 dark:bg-gray-800/50">
              <div className="flex items-center justify-between pb-2 border-b border-gray-200 dark:border-gray-700">
                <span className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-emerald-600" />
                  New Customer
                </span>
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(false)}
                  className="text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-1 rounded-full"
                >
                  Back to list
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Adebayo Ogunlesi"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div>
                <PhoneInput
                  label="Phone Number *"
                  value={newPhone}
                  onChange={(full) => setNewPhone(full)}
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  placeholder="customer@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div className="pt-1 flex gap-2">
                <Button
                  type="submit"
                  size="sm"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-full py-2.5"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving…' : 'Save & Select Customer'}
                </Button>
              </div>
              <p className="text-center text-[11px] text-gray-500">
                Phone is used for voucher PIN & last-4 verification.
              </p>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
