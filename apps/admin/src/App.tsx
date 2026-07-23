import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

type AdminProfile = {
  id: string;
  display_name: string;
  username: string;
  is_admin: boolean;
  account_status: string;
};
type Report = {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reported_user_id: string | null;
  proof_submission_id: string | null;
  reporter_id: string;
};
type Proof = {
  id: string;
  status: string;
  verification_score: number | null;
  created_at: string;
  user_id: string;
  commitment: { title: string } | null;
  asset_path: string | null;
  signed_url: string | null;
};
type UserRow = {
  id: string;
  display_name: string;
  username: string;
  account_status: string;
  completion_rate: number;
  created_at: string;
};

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  return (
    <main className="auth">
      <section className="auth-card">
        <p className="eyebrow red">CALLEDOUT ADMIN</p>
        <h1>Receipts, disputes, and consequences.</h1>
        <p className="muted">Admin authorization is checked by Supabase on every protected query and RPC.</p>
        <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" /></label>
        <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" /></label>
        {error && <p className="error">{error}</p>}
        <button onClick={async () => {
          const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
          if (signInError) setError(signInError.message);
        }}>Sign in</button>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric"><p className="eyebrow">{label}</p><strong>{value}</strong></article>;
}

function Dashboard({ profile }: { profile: AdminProfile }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'overview' | 'reports' | 'proofs' | 'users'>('overview');
  const [search, setSearch] = useState('');

  const metrics = useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [users, commitments, proofs, misses, redemptions, circles, subscriptions, reports] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', since),
        supabase.from('commitments').select('*', { count: 'exact', head: true }).gte('created_at', since),
        supabase.from('proof_submissions').select('*', { count: 'exact', head: true }).gte('created_at', since),
        supabase.from('missed_commitments').select('*', { count: 'exact', head: true }).gte('created_at', since),
        supabase.from('redemptions').select('*', { count: 'exact', head: true }).eq('status', 'completed').gte('created_at', since),
        supabase.from('circles').select('*', { count: 'exact', head: true }).gte('created_at', since),
        supabase.from('entitlements').select('*', { count: 'exact', head: true }).eq('identifier', 'pro').eq('status', 'active'),
        supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      ]);
      return {
        newUsers: users.count ?? 0,
        commitments: commitments.count ?? 0,
        proofs: proofs.count ?? 0,
        misses: misses.count ?? 0,
        redemptions: redemptions.count ?? 0,
        circles: circles.count ?? 0,
        pro: subscriptions.count ?? 0,
        openReports: reports.count ?? 0,
      };
    },
  });

  const reports = useQuery({
    queryKey: ['admin', 'reports'],
    enabled: tab === 'reports',
    queryFn: async () => {
      const { data, error } = await supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data as Report[];
    },
  });

  const proofs = useQuery({
    queryKey: ['admin', 'proofs'],
    enabled: tab === 'proofs',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proof_submissions')
        .select('id,status,verification_score,created_at,user_id,asset_path,commitment:commitments(title)')
        .in('status', ['circle_review', 'disputed', 'more_proof_required'])
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return Promise.all((data ?? []).map(async (proof) => {
        const signed = proof.asset_path
          ? await supabase.storage.from('proof-media').createSignedUrl(proof.asset_path, 300)
          : { data: null };
        return { ...proof, signed_url: signed.data?.signedUrl ?? null } as unknown as Proof;
      }));
    },
  });

  const users = useQuery({
    queryKey: ['admin', 'users', search],
    enabled: tab === 'users',
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('id,display_name,username,account_status,completion_rate,created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (search.trim()) query = query.or(`username.ilike.%${search.trim()}%,display_name.ilike.%${search.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data as UserRow[];
    },
  });

  const moderate = useMutation({
    mutationFn: async (input: { userId: string; action: 'suspend' | 'ban' | 'reinstate'; reason: string }) => {
      const { error } = await supabase.rpc('admin_moderate_user', {
        p_user_id: input.userId,
        p_action: input.action,
        p_reason: input.reason,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });

  const resolve = useMutation({
    mutationFn: async (input: { reportId: string; status: 'actioned' | 'dismissed'; notes: string }) => {
      const { error } = await supabase.rpc('admin_resolve_report', {
        p_report_id: input.reportId,
        p_status: input.status,
        p_notes: input.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] }),
  });


  const resolveProof = useMutation({
    mutationFn: async (input: { proofId: string; decision: 'accept' | 'reject' }) => {
      const { error } = await supabase.rpc('admin_resolve_proof', {
        p_submission_id: input.proofId,
        p_decision: input.decision,
        p_notes: 'Resolved in CalledOut admin dashboard',
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });

  return (
    <div className="shell">
      <aside>
        <div><p className="eyebrow red">CALLEDOUT</p><h2>Admin</h2></div>
        <nav>{(['overview', 'reports', 'proofs', 'users'] as const).map((item) => (
          <button className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item}</button>
        ))}</nav>
        <div><p className="muted">{profile.display_name}<br />@{profile.username}</p><button className="secondary" onClick={() => supabase.auth.signOut()}>Sign out</button></div>
      </aside>
      <main className="workspace">
        <header><div><p className="eyebrow">SECURE OPERATIONS</p><h1>{tab[0].toUpperCase() + tab.slice(1)}</h1></div><span className="stamp">ADMIN VERIFIED</span></header>
        {tab === 'overview' && <>
          {metrics.isLoading ? <p>Loading metrics…</p> : <section className="metrics">
            <Metric label="NEW USERS · 7D" value={metrics.data?.newUsers ?? 0} />
            <Metric label="COMMITMENTS · 7D" value={metrics.data?.commitments ?? 0} />
            <Metric label="PROOFS · 7D" value={metrics.data?.proofs ?? 0} />
            <Metric label="MISSES · 7D" value={metrics.data?.misses ?? 0} />
            <Metric label="REDEMPTIONS · 7D" value={metrics.data?.redemptions ?? 0} />
            <Metric label="NEW CIRCLES · 7D" value={metrics.data?.circles ?? 0} />
            <Metric label="ACTIVE PRO" value={metrics.data?.pro ?? 0} />
            <Metric label="OPEN REPORTS" value={metrics.data?.openReports ?? 0} />
          </section>}
          <section className="panel"><h3>Operating principle</h3><p>Review behavior and proof integrity only. Never moderate users based on body shape, weight, athletic ability, disability, or workout intensity.</p></section>
        </>}
        {tab === 'reports' && <section className="panel table-wrap"><table><thead><tr><th>Created</th><th>Reason</th><th>Status</th><th>Target</th><th>Action</th></tr></thead><tbody>
          {reports.data?.map((report) => <tr key={report.id}><td>{new Date(report.created_at).toLocaleString()}</td><td><strong>{report.reason}</strong><br /><span className="muted">{report.details}</span></td><td>{report.status}</td><td>{report.reported_user_id ?? report.proof_submission_id ?? 'Content'}</td><td><button onClick={() => resolve.mutate({ reportId: report.id, status: 'actioned', notes: 'Reviewed in admin dashboard' })}>Actioned</button><button className="secondary" onClick={() => resolve.mutate({ reportId: report.id, status: 'dismissed', notes: 'No policy violation found' })}>Dismiss</button></td></tr>)}
        </tbody></table></section>}
        {tab === 'proofs' && <section className="panel table-wrap"><table><thead><tr><th>Proof</th><th>Created</th><th>Workout</th><th>Status</th><th>Score</th><th>User</th><th>Decision</th></tr></thead><tbody>
          {proofs.data?.map((proof) => <tr key={proof.id}><td>{proof.signed_url ? <a href={proof.signed_url} target="_blank" rel="noreferrer"><img className="proof-thumb" src={proof.signed_url} alt="Submitted workout proof" /></a> : 'Unavailable'}</td><td>{new Date(proof.created_at).toLocaleString()}</td><td>{proof.commitment?.title ?? 'Workout proof'}</td><td>{proof.status}</td><td>{proof.verification_score ?? '—'}</td><td>{proof.user_id}</td><td><button disabled={resolveProof.isPending} onClick={() => resolveProof.mutate({ proofId: proof.id, decision: 'accept' })}>Accept</button><button disabled={resolveProof.isPending} className="danger" onClick={() => resolveProof.mutate({ proofId: proof.id, decision: 'reject' })}>Reject</button></td></tr>)}
        </tbody></table></section>}
        {tab === 'users' && <>
          <input className="search" placeholder="Search display name or username" value={search} onChange={(event) => setSearch(event.target.value)} />
          <section className="panel table-wrap"><table><thead><tr><th>User</th><th>Status</th><th>Completion</th><th>Joined</th><th>Moderation</th></tr></thead><tbody>
            {users.data?.map((user) => <tr key={user.id}><td><strong>{user.display_name}</strong><br /><span className="muted">@{user.username}</span></td><td>{user.account_status}</td><td>{user.completion_rate}%</td><td>{new Date(user.created_at).toLocaleDateString()}</td><td><button onClick={() => moderate.mutate({ userId: user.id, action: 'suspend', reason: 'Admin review action' })}>Suspend</button><button className="danger" onClick={() => moderate.mutate({ userId: user.id, action: 'ban', reason: 'Confirmed severe policy violation' })}>Ban</button><button className="secondary" onClick={() => moderate.mutate({ userId: user.id, action: 'reinstate', reason: 'Appeal accepted or restriction complete' })}>Reinstate</button></td></tr>)}
          </tbody></table></section>
        </>}
      </main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);
  const profile = useQuery({
    queryKey: ['admin', 'profile', session?.user.id],
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id,display_name,username,is_admin,account_status').eq('id', session!.user.id).single();
      if (error) throw error;
      return data as AdminProfile;
    },
  });
  const denied = useMemo(() => profile.data && !profile.data.is_admin, [profile.data]);
  if (!session) return <Login />;
  if (profile.isLoading) return <main className="center">Checking admin authorization…</main>;
  if (denied) return <main className="center"><section className="auth-card"><h1>Access denied.</h1><p>This account does not have a server-authorized admin role.</p><button onClick={() => supabase.auth.signOut()}>Sign out</button></section></main>;
  return profile.data ? <Dashboard profile={profile.data} /> : null;
}
