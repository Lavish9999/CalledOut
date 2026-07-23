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

type UserRow = {
  id: string;
  display_name: string;
  username: string;
  account_status: string;
  completion_rate: number;
  created_at: string;
};

type AdminTab = 'overview' | 'reports' | 'users';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  return (
    <main className="auth">
      <section className="auth-card">
        <p className="eyebrow red">CALLEDOUT ADMIN</p>
        <h1>Safety, reports, and account operations.</h1>
        <p className="muted">
          Workout proof stays between members and their accountability circles.
          This dashboard is only for safety reports and account enforcement.
        </p>
        <label>
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
          />
        </label>
        <label>
          Password
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button
          onClick={async () => {
            setError('');
            const { error: signInError } = await supabase.auth.signInWithPassword({
              email,
              password,
            });
            if (signInError) setError(signInError.message);
          }}
        >
          Sign in
        </button>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="metric">
      <p className="eyebrow">{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function requiredReviewNote(promptText: string, initial = '') {
  const note = window.prompt(promptText, initial)?.trim() ?? '';
  return note.length >= 5 ? note : null;
}

function Dashboard({ profile }: { profile: AdminProfile }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState('');

  const metrics = useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [users, commitments, proofs, misses, redemptions, circles, subscriptions, reports] =
        await Promise.all([
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
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Report[];
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

      if (search.trim()) {
        query = query.or(
          `username.ilike.%${search.trim()}%,display_name.ilike.%${search.trim()}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as UserRow[];
    },
  });

  const moderate = useMutation({
    mutationFn: async (input: {
      userId: string;
      action: 'suspend' | 'ban' | 'reinstate';
      reason: string;
    }) => {
      const { error } = await supabase.rpc('admin_moderate_user', {
        p_user_id: input.userId,
        p_action: input.action,
        p_reason: input.reason,
      });
      if (error) throw error;
    },
    onMutate: () => setActionError(''),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
    onError: (error) =>
      setActionError(error instanceof Error ? error.message : 'Moderation failed'),
  });

  const resolve = useMutation({
    mutationFn: async (input: {
      reportId: string;
      status: 'actioned' | 'dismissed';
      notes: string;
    }) => {
      const { error } = await supabase.rpc('admin_resolve_report', {
        p_report_id: input.reportId,
        p_status: input.status,
        p_notes: input.notes,
      });
      if (error) throw error;
    },
    onMutate: () => setActionError(''),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] }),
    onError: (error) =>
      setActionError(error instanceof Error ? error.message : 'Report action failed'),
  });

  function moderateUser(user: UserRow, action: 'suspend' | 'ban' | 'reinstate') {
    const reason = requiredReviewNote(
      `Required case note for ${action}ing @${user.username}:`,
    );
    if (!reason) return;
    if (!window.confirm(`${action} @${user.username}? This action is audited.`)) return;
    moderate.mutate({ userId: user.id, action, reason });
  }

  function resolveReport(report: Report, status: 'actioned' | 'dismissed') {
    const notes = requiredReviewNote(
      `Required review note for marking this report ${status}:`,
    );
    if (!notes) return;
    if (!window.confirm(`Mark this report ${status}?`)) return;
    resolve.mutate({ reportId: report.id, status, notes });
  }

  return (
    <div className="shell">
      <aside>
        <div>
          <p className="eyebrow red">CALLEDOUT</p>
          <h2>Admin</h2>
        </div>
        <nav>
          {(['overview', 'reports', 'users'] as const).map((item) => (
            <button
              className={tab === item ? 'active' : ''}
              onClick={() => setTab(item)}
              key={item}
            >
              {item}
            </button>
          ))}
        </nav>
        <div>
          <p className="muted">
            {profile.display_name}
            <br />@{profile.username}
          </p>
          <button className="secondary" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header>
          <div>
            <p className="eyebrow">SECURE OPERATIONS</p>
            <h1>{tab[0].toUpperCase() + tab.slice(1)}</h1>
          </div>
          <span className="stamp">ADMIN VERIFIED</span>
        </header>

        {actionError && <p className="error">{actionError}</p>}

        {tab === 'overview' && (
          <>
            {metrics.isLoading ? (
              <p>Loading metrics…</p>
            ) : (
              <section className="metrics">
                <Metric label="NEW USERS · 7D" value={metrics.data?.newUsers ?? 0} />
                <Metric label="COMMITMENTS · 7D" value={metrics.data?.commitments ?? 0} />
                <Metric label="PROOFS SUBMITTED · 7D" value={metrics.data?.proofs ?? 0} />
                <Metric label="MISSES · 7D" value={metrics.data?.misses ?? 0} />
                <Metric label="REDEMPTIONS · 7D" value={metrics.data?.redemptions ?? 0} />
                <Metric label="NEW CIRCLES · 7D" value={metrics.data?.circles ?? 0} />
                <Metric label="ACTIVE PRO" value={metrics.data?.pro ?? 0} />
                <Metric label="OPEN REPORTS" value={metrics.data?.openReports ?? 0} />
              </section>
            )}
            <section className="panel">
              <h3>Operating boundary</h3>
              <p>
                Workout proof is decided by the member’s own circle. Private
                fresh proof is verified automatically when required capture
                checks pass. Admins handle safety reports and account enforcement
                only.
              </p>
            </section>
          </>
        )}

        {tab === 'reports' && (
          <section className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Target</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {reports.data?.map((report) => (
                  <tr key={report.id}>
                    <td>{new Date(report.created_at).toLocaleString()}</td>
                    <td>
                      <strong>{report.reason}</strong>
                      <br />
                      <span className="muted">{report.details}</span>
                    </td>
                    <td>{report.status}</td>
                    <td>
                      {report.reported_user_id ??
                        report.proof_submission_id ??
                        'Content'}
                    </td>
                    <td>
                      <button onClick={() => resolveReport(report, 'actioned')}>
                        Actioned
                      </button>
                      <button
                        className="secondary"
                        onClick={() => resolveReport(report, 'dismissed')}
                      >
                        Dismiss
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'users' && (
          <>
            <input
              className="search"
              placeholder="Search display name or username"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <section className="panel table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Status</th>
                    <th>Completion</th>
                    <th>Joined</th>
                    <th>Moderation</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data?.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.display_name}</strong>
                        <br />
                        <span className="muted">@{user.username}</span>
                      </td>
                      <td>{user.account_status}</td>
                      <td>{user.completion_rate}%</td>
                      <td>{new Date(user.created_at).toLocaleDateString()}</td>
                      <td>
                        <button
                          disabled={moderate.isPending}
                          onClick={() => moderateUser(user, 'suspend')}
                        >
                          Suspend
                        </button>
                        <button
                          className="danger"
                          disabled={moderate.isPending}
                          onClick={() => moderateUser(user, 'ban')}
                        >
                          Ban
                        </button>
                        <button
                          className="secondary"
                          disabled={moderate.isPending}
                          onClick={() => moderateUser(user, 'reinstate')}
                        >
                          Reinstate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  const profile = useQuery({
    queryKey: ['admin', 'profile', session?.user.id],
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,display_name,username,is_admin,account_status')
        .eq('id', session!.user.id)
        .single();
      if (error) throw error;
      return data as AdminProfile;
    },
  });

  const denied = useMemo(
    () =>
      profile.data &&
      (!profile.data.is_admin || profile.data.account_status !== 'active'),
    [profile.data],
  );

  if (!session) return <Login />;
  if (profile.isLoading) {
    return <main className="center">Checking admin authorization…</main>;
  }
  if (denied) {
    return (
      <main className="center">
        <section className="auth-card">
          <h1>Access denied.</h1>
          <p>This account does not have an active server-authorized admin role.</p>
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        </section>
      </main>
    );
  }

  return profile.data ? <Dashboard profile={profile.data} /> : null;
}
