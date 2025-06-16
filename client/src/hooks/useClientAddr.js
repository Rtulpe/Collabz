import { useEffect } from 'react';

export default function useClientAddr(setClientAddr) {
  useEffect(() => {
    setClientAddr(window.location.host);
  }, [setClientAddr]);
}
