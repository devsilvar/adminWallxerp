import { Plus } from 'lucide-react';
import Button from '@/components/ui/Button.tsx';
import CreateBusinessModal from '@/components/CreateBusinessModal.tsx';
import { useAuthStore } from '@/stores/auth.store.ts';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useState } from 'react';

interface NoBusinessPromptProps {
  title?: string;
  message?: string;
}

export default function NoBusinessPrompt({ 
  title = 'No business selected', 
  message = 'Create or select a business to access this feature.' 
}: NoBusinessPromptProps) {
  const user = useAuthStore((s) => s.user);
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);
  const businesses = useBusinessStore((s) => s.businesses);
  const [showModal, setShowModal] = useState(false);

  if (activeBusiness) return null;

  const isOwnerAccount = businesses.length > 0
    ? businesses.some((b) => b.myRole === 'owner' || b.userId === user?.id)
    : user?.isOwnerAccount !== false;

  return (
    <>
      <div className='flex flex-col items-center justify-center py-32 animate-fade-in'>
        <div className='relative mb-8'>
          <div className='absolute inset-0 rounded-2xl bg-primary-200 blur-2xl opacity-40 animate-pulse-soft' />
          <div className='relative rounded-2xl bg-gradient-to-br from-primary-50 to-white p-8 border border-primary-100 shadow-sm animate-float'>
            <Plus className='h-10 w-10 text-primary-400' />
          </div>
        </div>
        <p className='text-xl font-bold text-gray-900'>{title}</p>
        <p className='text-sm text-gray-400 mt-2 mb-8 text-center max-w-sm'>
          {isOwnerAccount
            ? message
            : 'Please select an invited business from the sidebar or contact your administrator.'}
        </p>
        {isOwnerAccount && (
          <Button onClick={() => setShowModal(true)}>Create Business</Button>
        )}
      </div>
      {isOwnerAccount && (
        <CreateBusinessModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          required
        />
      )}
    </>
  );
}