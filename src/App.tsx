import React, { useEffect, useMemo, useState } from 'react';
import {
  Menu,
  Play,
  Square,
  Activity,
  CheckCircle,
  TriangleAlert,
  RotateCcw,
  Moon,
  Sun,
  X,
  LogIn,
  LogOut,
  Cloud,
  CloudOff,
  LoaderCircle,
} from 'lucide-react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, firebaseEnabled, googleProvider } from './firebase';

interface Contraction {
  id: string;
  startTime: number;
  endTime: number | null;
}

const GUEST_STORAGE_KEY = 'contraction-counter-guest-history-v1';
const THEME_STORAGE_KEY = 'contraction-counter-theme-v1';

const formatMinSec = (ms: number): string => {
  if (ms < 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatTimeOfDay = (timestamp: number): string => {
  const d = new Date(timestamp);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

const sortDesc = (list: Contraction[]) => [...list].sort((a, b) => b.startTime - a.startTime);

export default function App() {
  const [contractions, setContractions] = useState<Contraction[]>([]);
  const [now, setNow] = useState<number>(Date.now());
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light',
  );
  const isDark = theme === 'dark';

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme, isDark]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (contractions.length > 0) {
      interval = setInterval(() => setNow(Date.now()), 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [contractions]);

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!db || !user) {
      const raw = localStorage.getItem(GUEST_STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Contraction[];
          setContractions(sortDesc(parsed));
        } catch {
          setContractions([]);
        }
      } else {
        setContractions([]);
      }
      return;
    }

    setDataLoading(true);
    const contractionQuery = query(collection(db, 'users', user.uid, 'contractions'), orderBy('startTime', 'desc'));

    const unsub = onSnapshot(
      contractionQuery,
      (snapshot) => {
        const next = snapshot.docs.map((entry) => {
          const value = entry.data() as { startTime: number; endTime: number | null };
          return { id: entry.id, startTime: value.startTime, endTime: value.endTime ?? null };
        });
        setContractions(next);
        setDataLoading(false);
      },
      () => {
        setStatusError('Could not sync contractions from Firebase right now.');
        setDataLoading(false);
      },
    );

    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (user) return;
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(contractions));
  }, [contractions, user]);

  const stats = useMemo(() => {
    let totalDuration = 0;
    let completedCount = 0;
    let totalFrequency = 0;
    let frequencyCount = 0;
    let pastHourCount = 0;

    const oneHourAgo = now - 60 * 60 * 1000;
    const sorted = [...contractions].sort((a, b) => a.startTime - b.startTime);

    sorted.forEach((c, index) => {
      if (c.startTime >= oneHourAgo) pastHourCount++;
      if (c.endTime !== null) {
        totalDuration += c.endTime - c.startTime;
        completedCount++;
      }
      if (index > 0) {
        totalFrequency += c.startTime - sorted[index - 1].startTime;
        frequencyCount++;
      }
    });

    return {
      avgDuration: completedCount > 0 ? totalDuration / completedCount : 0,
      avgFrequency: frequencyCount > 0 ? totalFrequency / frequencyCount : 0,
      pastHourCount,
    };
  }, [contractions, now]);

  const is411 = useMemo(() => {
    if (contractions.length < 2) return false;

    const oldest = [...contractions].sort((a, b) => a.startTime - b.startTime)[0];
    if (now - oldest.startTime < 60 * 60 * 1000) return false;

    const pastHourContractions = contractions.filter((c) => now - c.startTime <= 60 * 60 * 1000);
    if (pastHourContractions.length < 10) return false;

    let totalDur = 0;
    let completed = 0;
    let totalFreq = 0;
    let freqCount = 0;

    const sortedRecent = [...pastHourContractions].sort((a, b) => a.startTime - b.startTime);
    sortedRecent.forEach((c, i) => {
      if (c.endTime !== null) {
        totalDur += c.endTime - c.startTime;
        completed++;
      }
      if (i > 0) {
        totalFreq += c.startTime - sortedRecent[i - 1].startTime;
        freqCount++;
      }
    });

    const avgDur = completed > 0 ? totalDur / completed : 0;
    const avgFreq = freqCount > 0 ? totalFreq / freqCount : 0;

    return avgDur >= 50000 && avgFreq <= 300000 && avgFreq > 0;
  }, [contractions, now]);

  const displayContractions = sortDesc(contractions);
  const activeContraction = displayContractions.find((c) => c.endTime === null);
  const isTracking = Boolean(activeContraction);

  const handleToggle = async () => {
    setStatusError(null);

    if (isTracking && activeContraction) {
      const endedAt = Date.now();
      setContractions((prev) => prev.map((c) => (c.id === activeContraction.id ? { ...c, endTime: endedAt } : c)));

      if (db && user) {
        try {
          await updateDoc(doc(db, 'users', user.uid, 'contractions', activeContraction.id), { endTime: endedAt });
        } catch {
          setStatusError('Failed to save contraction stop time. Please retry.');
        }
      }
      return;
    }

    const newContraction: Contraction = {
      id: crypto.randomUUID(),
      startTime: Date.now(),
      endTime: null,
    };

    setContractions((prev) => sortDesc([newContraction, ...prev]));

    if (db && user) {
      try {
        await setDoc(doc(db, 'users', user.uid, 'contractions', newContraction.id), newContraction);
      } catch {
        setStatusError('Failed to save contraction start time. Please retry.');
      }
    }
  };

  const handleGoogleSignIn = async () => {
    if (!auth) return;
    setStatusError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const code = error instanceof FirebaseError ? error.code : '';

      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch {
          setStatusError('Google sign-in needs a regular browser. Open this app in Chrome/Safari and try again.');
          return;
        }
      }

      if (code === 'auth/unauthorized-domain') {
        setStatusError('Google sign-in domain is not authorized in Firebase yet. Add this site URL in Firebase Auth.');
        return;
      }

      setStatusError('Google sign-in failed. Please try again.');
    }
  };

  const handleSignOut = async () => {
    if (!auth) return;
    setStatusError(null);
    try {
      await signOut(auth);
    } catch {
      setStatusError('Sign out failed. Please try again.');
    }
  };

  const handleStartOverConfirm = async () => {
    if (resetBusy) return;
    setStatusError(null);
    setResetBusy(true);

    try {
      if (db && user) {
        const snap = await getDocs(collection(db, 'users', user.uid, 'contractions'));
        await Promise.all(snap.docs.map((entry) => deleteDoc(entry.ref)));
      }
      setContractions([]);
      if (!user) localStorage.removeItem(GUEST_STORAGE_KEY);
      setResetConfirmOpen(false);
    } catch {
      setStatusError('Could not clear contraction history. Please try again.');
    } finally {
      setResetBusy(false);
    }
  };

  const lastContraction = displayContractions[0];
  const timeSinceLastStop =
    !isTracking && lastContraction && lastContraction.endTime !== null ? now - lastContraction.endTime : null;

  return (
    <div className={`min-h-screen font-sans ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-[#F6F8FC] text-slate-800'}`}>
      <header className={`sticky top-0 z-20 border-b backdrop-blur ${isDark ? 'border-slate-800 bg-slate-950/95' : 'border-slate-200/80 bg-white/95'}`}>
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pb-3 pt-6 md:px-6 md:pt-8">
          <button
            onClick={() => setMenuOpen(true)}
            className={`grid h-11 w-11 place-items-center rounded-full transition-colors ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
            aria-label="Menu"
          >
            <Menu size={22} />
          </button>

          <h1 className={`flex items-center gap-2 text-lg font-semibold tracking-tight md:text-2xl ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            <Activity size={20} className="text-blue-600" />
            Contraction Counter
          </h1>

          <button
            onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-colors md:text-sm ${
              isDark ? 'bg-slate-800 text-slate-100 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
            {isDark ? 'Light' : 'Dark'}
          </button>

          {firebaseEnabled ? (
            user ? (
              <button
                onClick={handleSignOut}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200 md:text-sm"
              >
                <LogOut size={14} /> Sign out
              </button>
            ) : (
              <button
                onClick={handleGoogleSignIn}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 md:text-sm"
              >
                <LogIn size={14} /> Sign in
              </button>
            )
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600 md:text-xs">
              Firebase not configured
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-4 md:px-6 md:pb-8 md:pt-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
          <section className="order-2 lg:order-1">
            <div className="mb-3 px-1">
              <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                {authLoading || dataLoading ? (
                  <>
                    <LoaderCircle size={14} className="animate-spin" /> Syncing...
                  </>
                ) : user ? (
                  <>
                    <Cloud size={14} className="text-emerald-600" /> Synced as {user.displayName ?? user.email}
                  </>
                ) : (
                  <>
                    <CloudOff size={14} className="text-slate-400" /> Guest mode (local only)
                  </>
                )}
              </div>
              {statusError && <p className="mt-2 text-xs font-medium text-rose-600">{statusError}</p>}
            </div>

            {is411 && (
              <div className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 shadow-sm">
                <div className="shrink-0 rounded-full bg-emerald-500 p-2 text-white">
                  <CheckCircle size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold">4-1-1 Rule Reached</h3>
                  <p className="text-sm">
                    Contractions are near 4 mins apart, lasting about 1 min, for over an hour. Time to call your
                    doctor or head to the hospital.
                  </p>
                </div>
              </div>
            )}

            <div className={`rounded-3xl border p-3 shadow-sm md:p-4 ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
              <h2 className={`mb-2 px-2 text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>History</h2>

              {displayContractions.length > 0 ? (
                <div className="flex flex-col">
                  {displayContractions.map((c, index) => {
                    const durationMs = c.endTime !== null ? c.endTime - c.startTime : now - c.startTime;
                    const prevContraction = displayContractions[index + 1];
                    const frequencyStr = prevContraction ? formatMinSec(c.startTime - prevContraction.startTime) : '--';
                    const nodeNumber = displayContractions.length - index;

                    return (
                      <React.Fragment key={c.id}>
                        <div
                          className={`relative z-10 flex items-center justify-between rounded-2xl border p-4 transition-all md:p-5 ${
                            c.endTime === null
                              ? isDark
                                ? 'border-rose-800/70 bg-rose-950/30 shadow-[0_8px_24px_rgba(244,63,94,0.12)]'
                                : 'border-rose-200 bg-rose-50/70 shadow-[0_8px_24px_rgba(244,63,94,0.08)]'
                              : isDark
                                ? 'border-slate-800 bg-slate-900'
                                : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div
                            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-base font-bold md:h-12 md:w-12 md:text-lg ${
                              c.endTime === null
                                ? isDark
                                  ? 'bg-rose-900/40 text-rose-300'
                                  : 'bg-rose-100 text-rose-700'
                                : isDark
                                  ? 'bg-slate-800 text-slate-300'
                                  : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {nodeNumber}
                          </div>

                          <div className="min-w-0 flex-1 px-3 md:px-4">
                            <div className={`text-lg font-bold md:text-xl ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                              {formatMinSec(durationMs)}
                              {c.endTime === null && <span className="ml-1 text-rose-500 animate-pulse">●</span>}
                            </div>
                            <div className={`truncate text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Started {formatTimeOfDay(c.startTime)}</div>
                          </div>

                          <div className="text-right">
                            <div className={`text-base font-semibold md:text-lg ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{frequencyStr}</div>
                            <div className={`mt-1 text-[11px] font-medium uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Freq</div>
                          </div>
                        </div>

                        {prevContraction && prevContraction.endTime !== null && (
                          <div className="relative -my-1 flex items-center justify-center py-2">
                            <div className={`absolute bottom-0 top-0 w-0.5 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                            <div className={`z-10 flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium shadow-sm ${isDark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-white text-slate-500'}`}>
                              <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>Rest:</span>
                              <span className={`font-bold ${isDark ? 'text-slate-100' : 'text-slate-700'}`}>
                                {formatMinSec(c.startTime - prevContraction.endTime)}
                              </span>
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className={`mb-4 grid h-20 w-20 place-items-center rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                    <Activity size={28} className={isDark ? 'text-slate-500' : 'text-slate-400'} />
                  </div>
                  <p className={`font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>No contractions logged yet.</p>
                  <p className={`mt-1 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Tap the start button to begin tracking.</p>
                </div>
              )}
            </div>
          </section>

          <aside className="order-1 lg:order-2 lg:sticky lg:top-24 lg:self-start">
            <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-center lg:p-4">
                <div className="text-2xl font-bold text-blue-900">{stats.avgDuration > 0 ? formatMinSec(stats.avgDuration) : '0:00'}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">Avg duration</div>
              </div>
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-3 text-center lg:p-4">
                <div className="text-2xl font-bold text-indigo-900">{stats.pastHourCount}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">Past hour</div>
              </div>
              <div className="rounded-2xl border border-violet-100 bg-violet-50 p-3 text-center lg:p-4">
                <div className="text-2xl font-bold text-violet-900">{stats.avgFrequency > 0 ? formatMinSec(stats.avgFrequency) : '0:00'}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-700">Avg frequency</div>
              </div>
            </div>

            <div className={`mt-4 hidden rounded-3xl border p-4 shadow-sm lg:block ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
              {timeSinceLastStop !== null && (
                <div className={`mb-4 rounded-2xl border px-4 py-3 text-center ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50'}`}>
                  <span className={`text-[11px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Resting Time</span>
                  <div className={`text-2xl font-bold leading-tight tabular-nums ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    {formatMinSec(timeSinceLastStop)}
                  </div>
                </div>
              )}

              <button
                onClick={handleToggle}
                className={`inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl px-6 py-3 text-base font-bold text-white transition-all ${
                  isTracking
                    ? 'bg-rose-500 hover:bg-rose-600 shadow-[0_10px_24px_rgba(244,63,94,0.28)]'
                    : 'bg-blue-600 hover:bg-blue-700 shadow-[0_10px_24px_rgba(37,99,235,0.28)]'
                }`}
              >
                {isTracking ? <Square className="fill-current" size={20} /> : <Play className="ml-0.5 fill-current" size={20} />}
                <span>{isTracking ? 'Stop timer' : 'Start contraction'}</span>
              </button>

              <button
                onClick={() => setResetConfirmOpen(true)}
                className={`mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-sm font-semibold transition-all ${isDark ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                <RotateCcw size={16} /> Start over
              </button>
            </div>
          </aside>
        </div>
      </main>

      <div className={`pointer-events-none fixed bottom-0 left-0 right-0 z-30 border-t p-4 backdrop-blur lg:hidden ${isDark ? 'border-slate-800 bg-slate-950/90' : 'border-slate-200/70 bg-white/90'}`} style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto w-full max-w-6xl">
          {timeSinceLastStop !== null && (
            <div className={`mb-3 rounded-full border px-5 py-2 text-center shadow-sm pointer-events-auto ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
              <span className={`text-[11px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Resting Time</span>
              <div className={`text-xl font-bold leading-tight tabular-nums ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{formatMinSec(timeSinceLastStop)}</div>
            </div>
          )}

          <button
            onClick={handleToggle}
            className={`pointer-events-auto inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl px-6 py-3 text-base font-bold text-white transition-all ${
              isTracking
                ? 'bg-rose-500 hover:bg-rose-600 shadow-[0_10px_24px_rgba(244,63,94,0.28)]'
                : 'bg-blue-600 hover:bg-blue-700 shadow-[0_10px_24px_rgba(37,99,235,0.28)]'
            }`}
          >
            {isTracking ? <Square className="fill-current" size={20} /> : <Play className="ml-0.5 fill-current" size={20} />}
            <span>{isTracking ? 'Stop timer' : 'Start contraction'}</span>
          </button>

          <button
            onClick={() => setResetConfirmOpen(true)}
            className={`pointer-events-auto mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-sm font-semibold transition-all ${isDark ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
          >
            <RotateCcw size={16} /> Start over
          </button>
        </div>
      </div>

      {resetConfirmOpen && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/55 p-4">
          <div className={`w-full max-w-md rounded-3xl border p-5 shadow-2xl ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
            <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <TriangleAlert size={20} />
            </div>
            <h3 className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Start over?</h3>
            <p className={`mt-1 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              This will permanently clear your contraction history{user ? ' from Firebase and this device' : ''}.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setResetConfirmOpen(false)}
                className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold ${isDark ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
              >
                Cancel
              </button>
              <button
                onClick={handleStartOverConfirm}
                disabled={resetBusy}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resetBusy ? 'Clearing…' : 'Yes, clear all'}
              </button>
            </div>
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="fixed inset-0 z-50">
          <button className="absolute inset-0 bg-slate-900/45" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
          <div className={`absolute left-0 top-0 h-full w-[86%] max-w-sm border-r p-5 shadow-2xl ${isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'}`}>
            <div className="mb-5 flex items-center justify-between">
              <h3 className={`text-base font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Menu</h3>
              <button
                onClick={() => setMenuOpen(false)}
                className={`grid h-10 w-10 place-items-center rounded-full ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setResetConfirmOpen(true);
                }}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-semibold ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}
              >
                <span>Start over</span>
                <RotateCcw size={16} />
              </button>

              <button
                onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-semibold ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}
              >
                <span>{isDark ? 'Switch to light mode' : 'Switch to dark mode'}</span>
                {isDark ? <Sun size={16} /> : <Moon size={16} />}
              </button>

              {firebaseEnabled && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    if (user) void handleSignOut();
                    else void handleGoogleSignIn();
                  }}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-semibold ${isDark ? 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}
                >
                  <span>{user ? 'Sign out' : 'Sign in with Google'}</span>
                  {user ? <LogOut size={16} /> : <LogIn size={16} />}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
