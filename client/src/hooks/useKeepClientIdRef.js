import { useEffect } from 'react';

export default function useKeepClientIdRef(clientId, clientIdRef) {
  useEffect(() => {
    clientIdRef.current = clientId;
  }, [clientId, clientIdRef]);
}
