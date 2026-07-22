import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import { getPublicPageKey, PublicSite } from './public-site';
import './styles.css';

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});
const publicPageKey = getPublicPageKey();
const root = publicPageKey ? <PublicSite pageKey={publicPageKey} /> : <App />;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>{root}</QueryClientProvider>
  </React.StrictMode>,
);
