import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions:{
    queries:{staleTime:20_000,retry:2,refetchOnReconnect:true},
    mutations:{retry:0},
  },
});

export const qk = {
  profile:['profile'] as const,
  today:['commitments','today'] as const,
  commitment:(id:string)=>['commitment',id] as const,
  history:['commitment-history'] as const,
  schedules:['commitment-schedules'] as const,
  plan:['plan-overview'] as const,
  blocked:['blocked-members'] as const,
  gracePasses:['grace-passes'] as const,
  wall:(circleId?:string,period?:string)=>['wall',circleId,period] as const,
  wallMember:(userId:string,circleId?:string,period?:string)=>['wall-member',userId,circleId,period] as const,
  circles:['circles'] as const,
  circle:(id:string)=>['circle',id] as const,
  member:(id:string)=>['member',id] as const,
  proofResult:(commitmentId:string)=>['proof-result',commitmentId] as const,
  reviews:(circleId:string)=>['proof-reviews',circleId] as const,
  activity:(circleId?:string)=>['activity',circleId] as const,
};
