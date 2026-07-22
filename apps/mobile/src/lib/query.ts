import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      retry: 2,
      refetchOnReconnect: true,
    },
    mutations: { retry: 0 },
  },
});

export const qk = {
  profile: ["profile"] as const,
  record: ["profile", "record"] as const,
  history: ["profile", "history"] as const,
  insights: ["profile", "insights"] as const,
  plan: ["subscription", "plan"] as const,
  today: ["commitments", "today"] as const,
  schedules: ["commitments", "schedules"] as const,
  commitment: (commitmentId: string) =>
    ["commitments", "detail", commitmentId] as const,
  wall: (circleId?: string) => ["wall", circleId] as const,
  wallMember: (userId: string, circleId: string) =>
    ["wall", circleId, userId] as const,
  circles: ["circles"] as const,
  circle: (circleId: string) => ["circle", circleId] as const,
  activity: (circleId?: string) => ["activity", circleId] as const,
};
