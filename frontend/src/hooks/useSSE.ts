import { useEffect } from 'react';
import { getSSEClient } from '@/lib/sse-client';

export function useSSE(type: string, handler: (e: any) => void, deps: any[] = []) {
  useEffect(() => {
    const c = getSSEClient();
    c.connect();
    c.on(type, handler);
    return () => {
      c.off(type, handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, ...deps]);
}

export function useSSEConnection() {
  useEffect(() => {
    const c = getSSEClient();
    c.connect();
    return () => {
      c.disconnect();
    };
  }, []);
}
