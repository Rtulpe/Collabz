import { useEffect } from "react";

export default function useDebugClientId(clientId) {
  useEffect(() => {
    if (clientId) {
      console.log("My clientId:", clientId);
    }
  }, [clientId]);
}
