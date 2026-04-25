import React, { useState, useEffect, useMemo } from 'react';
import { Menu, Settings, Play, Square, Activity, CheckCircle } from 'lucide-react';

// --- Types ---
interface Contraction {
  id: string;
  startTime: number;
  endTime: number | null;
}

// --- Helper Functions ---
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

export default function App() {
  // --- State ---
  const [contractions, setContractions] = useState<Contraction[]>([]);
  const [now, setNow] = useState<number>(Date.now());

  // --- Effects ---
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    // Keep the timer ticking as long as we have any contractions,
    // so we can display the ongoing interval after hitting stop.
    if (contractions.length > 0) {
      interval = setInterval(() => setNow(Date.now()), 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [contractions]);

  // --- Derived Stats ---
  const stats = useMemo(() => {
    let totalDuration = 0;
    let completedCount = 0;
    let totalFrequency = 0;
    let frequencyCount = 0;
    let pastHourCount = 0;

    const oneHourAgo = now - 60 * 60 * 1000;
    const sorted = [...contractions].sort((a, b) => a.startTime - b.startTime);

    sorted.forEach((c, index) => {
      if (c.startTime >= oneHourAgo) {
        pastHourCount++;
      }
      if (c.endTime !== null) {
        totalDuration += c.endTime - c.startTime;
        completedCount++;
      }
      if (index > 0) {
        const prev = sorted[index - 1];
        totalFrequency += c.startTime - prev.startTime;
        frequencyCount++;
      }
    });

    return {
      avgDuration: completedCount > 0 ? totalDuration / completedCount : 0,
      avgFrequency: frequencyCount > 0 ? totalFrequency / frequencyCount : 0,
      pastHourCount,
    };
  }, [contractions, now]);

  // --- 4-1-1 Rule Logic ---
  const is411 = useMemo(() => {
    if (contractions.length < 2) return false;

    // 1. Must have been tracking for at least an hour
    const oldest = [...contractions].sort((a, b) => a.startTime - b.startTime)[0];
    if (now - oldest.startTime < 60 * 60 * 1000) return false;

    // 2. Look at the data from the past hour
    const pastHourContractions = contractions.filter((c) => now - c.startTime <= 60 * 60 * 1000);

    // Ensure sufficient data points to establish a real pattern (e.g., at least 10 contractions)
    if (pastHourContractions.length < 10) return false;

    let totalDur = 0,
      completed = 0;
    let totalFreq = 0,
      freqCount = 0;

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

    // 4-1-1 Criteria: Duration >= ~50s, Frequency <= ~5 mins (300,000ms), for 1 hour.
    // (Giving generous boundaries to ensure it triggers in real human conditions)
    return avgDur >= 50000 && avgFreq <= 300000 && avgFreq > 0;
  }, [contractions, now]);

  const activeContraction = contractions.find((c) => c.endTime === null);
  const isTracking = !!activeContraction;

  // --- Handlers ---
  const handleToggle = () => {
    if (isTracking && activeContraction) {
      setContractions((prev) =>
        prev.map((c) => (c.id === activeContraction.id ? { ...c, endTime: Date.now() } : c)),
      );
    } else {
      const newContraction: Contraction = {
        id: crypto.randomUUID(),
        startTime: Date.now(),
        endTime: null,
      };
      setContractions((prev) => [newContraction, ...prev]);
    }
  };

  const displayContractions = [...contractions].sort((a, b) => b.startTime - a.startTime);

  // Calculate ongoing rest interval since the last contraction ended
  const lastContraction = displayContractions[0];
  const timeSinceLastStop =
    !isTracking && lastContraction && lastContraction.endTime !== null
      ? now - lastContraction.endTime
      : null;

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-gray-800 font-sans flex flex-col w-full max-w-md mx-auto shadow-2xl relative overflow-hidden">
      {/* --- TOP APP BAR --- */}
      <header className="bg-white px-4 pt-12 pb-4 flex justify-between items-center shadow-sm z-20 sticky top-0">
        <button className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600">
          <Menu size={24} />
        </button>
        <h1 className="text-xl font-medium tracking-tight text-gray-800 flex items-center gap-2">
          <Activity size={20} className="text-blue-600" />
          Contractions
        </h1>
        <button className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600">
          <Settings size={24} />
        </button>
      </header>

      {/* --- SCROLLABLE CONTENT --- */}
      <main className="flex-1 overflow-y-auto px-4 pt-6 pb-32 scrollbar-hide">
        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-blue-50 rounded-3xl p-4 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-bold text-blue-900 mb-1">
              {stats.avgDuration > 0 ? formatMinSec(stats.avgDuration) : '0:00'}
            </span>
            <span className="text-[11px] font-medium text-blue-700 uppercase tracking-wider">Avg Dur</span>
          </div>

          <div className="bg-indigo-50 rounded-3xl p-4 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-bold text-indigo-900 mb-1">{stats.pastHourCount}</span>
            <span className="text-[11px] font-medium text-indigo-700 uppercase tracking-wider">Past Hour</span>
          </div>

          <div className="bg-purple-50 rounded-3xl p-4 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-bold text-purple-900 mb-1">
              {stats.avgFrequency > 0 ? formatMinSec(stats.avgFrequency) : '0:00'}
            </span>
            <span className="text-[11px] font-medium text-purple-700 uppercase tracking-wider">Avg Freq</span>
          </div>
        </div>

        {/* Timeline Header */}
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 px-2">History</h2>

        {/* 4-1-1 Alert Banner */}
        {is411 && (
          <div className="bg-emerald-100 border-2 border-emerald-400 text-emerald-900 rounded-3xl p-5 mb-6 flex items-start gap-4 shadow-[0_8px_20px_rgba(16,185,129,0.15)] transition-all">
            <div className="bg-emerald-500 text-white p-2 rounded-full shadow-sm shrink-0">
              <CheckCircle size={24} />
            </div>
            <div>
              <h3 className="font-bold text-lg mb-1">4-1-1 Rule Reached!</h3>
              <p className="text-sm font-medium opacity-90 leading-snug">
                Contractions have been ~4 mins apart, lasting ~1 min, for over an hour. It's time to call the
                doctor or head to the hospital!
              </p>
            </div>
          </div>
        )}

        {/* Timeline List */}
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
                    className={`bg-white rounded-[28px] p-5 shadow-sm border ${
                      c.endTime === null ? 'border-rose-200 shadow-rose-100' : 'border-gray-100'
                    } flex items-center justify-between transition-all z-10 relative`}
                  >
                    {/* Left: Number indicator */}
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${
                        c.endTime === null ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {nodeNumber}
                    </div>

                    {/* Middle: Duration & Time */}
                    <div className="flex-1 px-4">
                      <div className="text-xl font-bold text-gray-800">
                        {formatMinSec(durationMs)}
                        {c.endTime === null && <span className="text-rose-500 animate-pulse ml-1">●</span>}
                      </div>
                      <div className="text-sm text-gray-500 font-medium">Started {formatTimeOfDay(c.startTime)}</div>
                    </div>

                    {/* Right: Frequency */}
                    <div className="text-right flex flex-col items-end">
                      <div className="text-lg font-semibold text-gray-700">{frequencyStr}</div>
                      <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider mt-1">Freq</div>
                    </div>
                  </div>

                  {/* Rest Time Connector (Between Contractions) */}
                  {prevContraction && prevContraction.endTime !== null && (
                    <div className="flex justify-center items-center py-2 relative -my-1 z-0">
                      <div className="absolute top-0 bottom-0 w-0.5 bg-gray-200"></div>
                      <div className="bg-white text-gray-500 text-xs font-medium px-4 py-1.5 rounded-full border border-gray-200 z-10 shadow-sm flex items-center gap-1">
                        <span className="text-gray-400">Rest:</span>
                        <span className="font-bold text-gray-700">
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
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Activity size={32} className="text-gray-400" />
            </div>
            <p className="text-gray-500 font-medium">No contractions logged yet.</p>
            <p className="text-gray-400 text-sm mt-1">Press the button below to start tracking.</p>
          </div>
        )}
      </main>

      {/* --- ACTION BUTTON SECTION --- */}
      <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-[#F8F9FA] via-[#F8F9FA] to-transparent flex flex-col items-center justify-end z-30 pointer-events-none">
        {/* Ongoing Interval Indicator */}
        {timeSinceLastStop !== null && (
          <div className="mb-4 bg-white/90 backdrop-blur-md px-6 py-2 rounded-full shadow-sm border border-gray-200 text-center pointer-events-auto">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Resting Time</span>
            <div className="text-xl font-bold text-gray-800 tabular-nums leading-tight">
              {formatMinSec(timeSinceLastStop)}
            </div>
          </div>
        )}

        <div className="pointer-events-auto shadow-2xl rounded-[32px]">
          <button
            onClick={handleToggle}
            className={`h-20 px-8 rounded-[32px] flex items-center justify-center gap-3 transition-all duration-300 ${
              isTracking
                ? 'bg-rose-500 hover:bg-rose-600 shadow-[0_8px_20px_rgba(244,63,94,0.3)] text-white'
                : 'bg-blue-600 hover:bg-blue-700 shadow-[0_8px_20px_rgba(37,99,235,0.3)] text-white'
            }`}
          >
            {isTracking ? (
              <>
                <Square className="fill-current" size={24} />
                <span className="text-lg font-bold tracking-wide">Stop Timer</span>
              </>
            ) : (
              <>
                <Play className="fill-current ml-1" size={24} />
                <span className="text-lg font-bold tracking-wide">Start Contraction</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
