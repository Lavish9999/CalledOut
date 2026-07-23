import React, { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '../lib/query';
import { SessionProvider } from './session';
import { ConnectivityProvider } from './connectivity';
import { installGlobalErrorHandler } from '../lib/observability';
export function AppProviders({children}:{children:React.ReactNode}){useEffect(()=>installGlobalErrorHandler(),[]);return <GestureHandlerRootView style={{flex:1}}><SafeAreaProvider><QueryClientProvider client={queryClient}><SessionProvider><ConnectivityProvider>{children}</ConnectivityProvider></SessionProvider></QueryClientProvider></SafeAreaProvider></GestureHandlerRootView>}
