import { useState, useEffect, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import Button from '@/components/ui/Button.tsx';
import Input from '@/components/ui/Input.tsx';
import toast from 'react-hot-toast';
import api from '@/lib/axios.ts';
import {
  ArrowLeft,
  Mail,
  CheckCircle,
  Copy,
  ExternalLink,
  AlertCircle,
  X,
} from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [showDevModal, setShowDevModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!showDevModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showDevModal]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Link copied to clipboard!');
    } catch (err) {
      toast.error('Failed to copy link');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error('Please enter your email address');
      return;
    }

    setIsLoading(true);

    try {
      const { data } = await api.post('/auth/forgot-password', {
        email: email.trim(),
      });

      console.log('🔍 API Response:', data);
      console.log('🔍 Reset Link:', data.data?.resetLink);

      setIsSubmitted(true);

      // If backend returns a resetLink (dev mode when email fails), show it in modal
      if (data.data?.resetLink) {
        console.log('✅ Reset link found, showing modal');
        setResetLink(data.data.resetLink);
        setShowDevModal(true);
      } else {
        console.log('❌ No reset link in response');
      }

      toast.success(data.message || 'Password reset link sent!');
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error?.message || 'Failed to send reset link';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevLinkClick = () => {
    if (resetLink) {
      // Extract token from reset link
      const url = new URL(resetLink);
      const token = url.searchParams.get('token');
      if (token) {
        navigate(`/reset-password?token=${token}`);
      }
    }
  };

  if (isSubmitted) {
    console.log('🎯 Render: isSubmitted =', isSubmitted);
    console.log('🎯 Render: showDevModal =', showDevModal);
    console.log('🎯 Render: resetLink =', resetLink);

    return (
      <div>
        {/* Debug info */}

        {/* Dev Mode Modal - Shows reset link when email service unavailable */}
        {showDevModal &&
          resetLink &&
          createPortal(
            <div className='fixed inset-0 z-[9999] w-screen h-screen min-h-screen flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-hidden'>
              <div
                className='absolute inset-0 cursor-default'
                onClick={() => setShowDevModal(false)}
              />
              <div className='relative z-10 bg-white rounded-none border border-gray-300 shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-150'>
                <div className='flex items-start justify-between mb-4 border-b border-gray-200 pb-3'>
                  <div className='flex items-center gap-3'>
                    <div className='w-9 h-9 bg-gray-900 text-white rounded-none flex items-center justify-center flex-shrink-0'>
                      <AlertCircle className='h-5 w-5' />
                    </div>
                    <div>
                      <h3 className='text-sm font-bold text-gray-900 tracking-tight'>
                        Development Mode
                      </h3>
                      <p className='text-xs text-gray-500'>
                        Email service not configured
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowDevModal(false)}
                    className='rounded-full border border-transparent p-1.5 text-gray-400 hover:border-gray-300 hover:bg-gray-100 hover:text-gray-700 transition-colors'
                    aria-label='Close'
                  >
                    <X className='h-4 w-4' />
                  </button>
                </div>

                <div className='bg-blue-50 border border-blue-200 rounded-none p-4 mb-4'>
                  <p className='font-body text-xs text-blue-900 mb-3'>
                    Since the email service isn't fully configured, here's your
                    password reset link:
                  </p>
                  <div className='bg-white border border-blue-200 rounded-none p-3 mb-3 font-mono text-xs break-all text-gray-800'>
                    {resetLink}
                  </div>
                  <div className='flex gap-2'>
                    <Button
                      onClick={handleDevLinkClick}
                      className='flex-1 py-2 text-xs rounded-full'
                    >
                      <ExternalLink className='h-3.5 w-3.5 mr-2' />
                      Reset Password Now
                    </Button>
                    <Button
                      onClick={() => copyToClipboard(resetLink)}
                      variant='outline'
                      className='px-4 py-2 rounded-full text-xs'
                    >
                      <Copy className='h-3.5 w-3.5' />
                    </Button>
                  </div>
                </div>

                <div className='bg-gray-50 rounded-none border border-gray-200 p-3 text-[11px] text-gray-600'>
                  <strong className='text-gray-900'>Note:</strong> This link is
                  only shown in development mode. In production, users will
                  receive an email with the reset link.
                </div>
              </div>
            </div>,
            document.body,
          )}

        <div className='mb-8 text-center'>
          <div className='mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4'>
            <CheckCircle className='h-8 w-8 text-green-600' strokeWidth={2} />
          </div>
          <h2 className='text-2xl font-bold text-gray-900'>Check your email</h2>
          <p className='mt-3 font-body text-[15px] text-gray-600 leading-relaxed'>
            We've sent a password reset link to{' '}
            <strong className='text-gray-900'>{email}</strong>
          </p>
        </div>

        <div className='bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6'>
          <p className='font-body text-sm text-blue-900 leading-relaxed'>
            <strong className='font-semibold'>What's next?</strong>
            <br />
            Click the link in your email to reset your password. The link
            expires in 60 minutes.
            <br />
            <br />
            Can't find the email? Check your spam folder.
          </p>
        </div>

        {/* Show dev link button if we have a reset link */}
        {resetLink && (
          <div className='mb-4'>
            <Button
              onClick={() => setShowDevModal(true)}
              variant='outline'
              className='w-full py-3 text-[15px] rounded-full border-yellow-400 text-yellow-700 hover:bg-yellow-50'
            >
              <AlertCircle className='h-4.5 w-4.5 mr-2' strokeWidth={2.5} />
              Show Reset Link (Dev Mode)
            </Button>
          </div>
        )}

        <div className='space-y-3'>
          <Button
            type='button'
            onClick={() => setIsSubmitted(false)}
            variant='outline'
            className='w-full py-3 text-[15px] rounded-full'
          >
            Try a different email
          </Button>

          <Link to='/login'>
            <Button
              variant='ghost'
              className='w-full py-3 text-[15px] rounded-full'
            >
              <ArrowLeft className='h-4.5 w-4.5 mr-2' strokeWidth={2.5} />
              Back to login
            </Button>
          </Link>
        </div>

        <div className='mt-8 border-t border-gray-100 pt-6'>
          <p className='text-center font-body text-xs text-gray-500'>
            Still having trouble? Contact support at{' '}
            <a
              href='mailto:support@paymytax.ng'
              className='text-primary-600 hover:text-primary-500 font-medium'
            >
              support@paymytax.ng
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className='mb-8'>
        <Link
          to='/login'
          className='inline-flex items-center font-body text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4'
        >
          <ArrowLeft className='h-4 w-4 mr-1.5' strokeWidth={2.5} />
          Back to login
        </Link>
        <h2 className='text-2xl font-bold text-gray-900'>
          Reset your password
        </h2>
        <p className='mt-2 font-body text-[15px] text-gray-500'>
          Enter your email address and we'll send you a link to reset your
          password
        </p>
      </div>

      <form onSubmit={handleSubmit} className='space-y-6'>
        <div className='relative'>
          <Input
            label='Email address'
            type='email'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder='you@example.com'
            required
            autoComplete='email'
            autoFocus
          />
          <Mail
            className='absolute right-3 top-[34px] h-5 w-5 text-gray-400'
            strokeWidth={2}
          />
        </div>

        <Button
          type='submit'
          isLoading={isLoading}
          className='w-full py-3 text-[15px] rounded-full'
        >
          {isLoading ? 'Sending...' : 'Send reset link'}
        </Button>
      </form>

      <div className='mt-8 border-t border-gray-100 pt-6'>
        <p className='text-center font-body text-[15px] text-gray-500'>
          Remember your password?{' '}
          <Link
            to='/login'
            className='font-semibold text-primary-600 hover:text-primary-500 transition-colors'
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
