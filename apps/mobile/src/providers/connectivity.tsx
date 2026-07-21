import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { retryPendingProofs } from "../lib/upload-queue";

export function ConnectivityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        if (state.isConnected && state.isInternetReachable !== false)
          retryPendingProofs().catch(() => {});
      }),
    [],
  );
  return children;
}
