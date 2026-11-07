import { Link } from 'react-router-dom';
import Button from '@/components/ui/Button.tsx';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-6xl font-bold text-gray-900">404</h1>
      <p className="mt-2 font-body text-gray-500">Page not found</p>
      <Link to="/dashboard" className="mt-6">
        <Button>Go to Dashboard</Button>
      </Link>
    </div>
  );
}
