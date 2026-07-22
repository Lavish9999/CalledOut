import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";

import { retryPendingProofs } from "../lib/upload-queue";
import { queryClient, qk } from "../lib/query";

export function ConnectivityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        if (!state.isConnected || state.isInternetReachable === false) return;

        retryPendingProofs()
          .then(async ({ completed, discarded }) => {
            if (!completed && !discarded) return;
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: qk.today }),
              queryClient.invalidateQueries({ queryKey: qk.history }),
            ]);
          })
          .catch(() => {});
      }),
    [],
  );

  return children;
}
