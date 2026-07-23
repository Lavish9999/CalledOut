import { create } from 'zustand';
import type { WorkoutType } from '../types/domain';
type State={displayName:string;username:string;bio:string;workouts:WorkoutType[];days:number[];deadlineHour:number;minimumDuration:number;set:<K extends keyof Omit<State,'set'|'reset'>>(key:K,value:State[K])=>void;reset:()=>void};
const initial={displayName:'',username:'',bio:'',workouts:[] as WorkoutType[],days:[1,3,5],deadlineHour:20,minimumDuration:30};
export const useOnboarding=create<State>((set)=>({...initial,set:(key,value)=>set({[key]:value} as Partial<State>),reset:()=>set(initial)}));
