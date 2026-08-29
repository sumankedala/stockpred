import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ReferenceLine
} from 'recharts';
import {
  TrendingUp, TrendingDown, RefreshCw, Activity,
  ArrowUpRight, ArrowDownRight, Award, ShieldAlert,
  ChevronDown, ChevronUp, Layers, Zap, Info, Sparkles, CheckCircle2,
  Search, SlidersHorizontal, AlertTriangle, ExternalLink, Flame, Target
} from 'lucide-react';

interface ScoreBreakdown {
  technicals: number;
  fundamentals: number;
  macro: number;
  sentiment: number;
  ml: number;
}

interface PriceTargets {
  buy_zone: string;
  buy_zone_low?: number;
  buy_zone_high?: number;
  exit_target: string;
  exit_target_val?: number;
  stop_loss: string;
  stop_loss_val?: number;
}

interface NewsHeadline {
  title: string;
  source: string;
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  score: number;
}

interface NasdaqSignalItem {
  symbol: string;
  name: string;
  price: number;
  change_pct: number;
  sparkline: number[];
  high_52w: number;
  low_52w: number;
  rsi: number;
  composite_score: number;
  scores: ScoreBreakdown;
  targets: PriceTargets;
  verdict: 'STRONG BUY' | 'MODERATE BUY' | 'HOLD' | 'MODERATE SELL' | 'STRONG SELL' | string;
  action_text?: string;
  rsi_status: string;
  macd_status: string;
  sma_status?: string;
  pe_ratio: number | string;
  eps_growth: string;
  fcf_status?: string;
  sector_momentum?: string;
  ml_forecast_pct?: string;
  headlines?: NewsHeadline[];
}

interface TopPickChartPoint {
  date: string;
  price: number;
  upper_band?: number;
  lower_band?: number;
  sma50?: number;
  buy_zone_low?: number;
  buy_zone_high?: number;
  exit_target?: number;
  stop_loss?: number;
}

interface TopPickAnalysis {
  symbol: string;
  name: string;
  price: number;
  change_pct?: number;
  composite_score: number;
  verdict: string;
  action_text?: string;
  scores: ScoreBreakdown;
  targets: PriceTargets;
  chart_data?: TopPickChartPoint[];
  catalysts?: string[];
  risks?: string[];
  headlines?: NewsHeadline[];
  thesis: string;
}

interface NasdaqSignalsTabProps {
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
}

// Sparkline Mini-Tooltip
const SparkTooltip = ({ active, payload, currency }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-950/95 border border-slate-700/80 rounded-lg px-2.5 py-1 text-[11px] font-bold text-white shadow-2xl backdrop-blur-md">
        {currency}{Number(payload[0].value).toFixed(2)}
      </div>
    );
  }
  return null;
};

// Top Pick Chart Custom Tooltip
const TopPickChartTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-950/95 border border-amber-500/40 rounded-xl p-3 text-xs shadow-2xl backdrop-blur-md text-white min-w-[170px]">
        <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1.5">{label}</div>
        <div className="flex items-center justify-between gap-3 text-sm font-black mb-1">
          <span className="text-slate-300">Price:</span>
          <span className="text-white font-mono">${data.price?.toFixed(2)}</span>
        </div>
        {data.upper_band && (
          <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
            <span>Upper Band:</span>
            <span className="font-mono text-indigo-300">${data.upper_band?.toFixed(2)}</span>
          </div>
        )}
        {data.lower_band && (
          <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
            <span>Lower Band:</span>
            <span className="font-mono text-emerald-300">${data.lower_band?.toFixed(2)}</span>
          </div>
        )}
        {data.sma50 && (
          <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
            <span>50 SMA:</span>
            <span className="font-mono text-cyan-300">${data.sma50?.toFixed(2)}</span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

// Composite Score Circular Badge
const ScoreRing = ({ score, size = 'normal' }: { score: number; size?: 'normal' | 'large' }) => {
  const isLarge = size === 'large';
  const color =
    score >= 80 ? 'text-emerald-400 border-emerald-500/60 bg-emerald-500/10 shadow-emerald-500/20' :
    score >= 65 ? 'text-teal-400 border-teal-500/60 bg-teal-500/10 shadow-teal-500/20' :
    score >= 35 ? 'text-amber-400 border-amber-500/60 bg-amber-500/10 shadow-amber-500/20' :
    score >= 20 ? 'text-orange-400 border-orange-500/60 bg-orange-500/10 shadow-orange-500/20' :
    'text-rose-400 border-rose-500/60 bg-rose-500/10 shadow-rose-500/20';

  const dim = isLarge ? 'w-16 h-16 border-[3px]' : 'w-12 h-12 border-2';

  return (
    <div className={`${dim} rounded-2xl flex flex-col items-center justify-center font-black ${color} shadow-lg shrink-0 transition-transform duration-300 hover:scale-105`}>
      <span className={`${isLarge ? 'text-xl' : 'text-sm'} leading-none tracking-tight`}>{Math.round(score)}</span>
      <span className={`${isLarge ? 'text-[8px]' : 'text-[7px]'} text-slate-400 font-semibold uppercase tracking-wider`}>score</span>
    </div>
  );
};

// Factor Score Bar Indicator
const FactorBar = ({ label, score, max, color }: { label: string; score: number; max: number; color: string }) => {
  const pct = Math.min(100, Math.max(0, (score / max) * 100));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[10px] text-slate-400 font-medium">
        <span>{label}</span>
        <span className="text-white font-mono font-bold">{score}/{max}</span>
      </div>
      <div className="h-1.5 bg-slate-800/90 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

// Individual Stock Card
const SignalCard = ({
  item,
  type,
  rank,
}: {
  item: NasdaqSignalItem;
  type: 'buy' | 'sell';
  rank: number;
}) => {
  const [expanded, setExpanded] = useState(false);
  const isBuy = type === 'buy';
  const isUp = item.change_pct >= 0;
  const currency = '$';
  const sparkData = item.sparkline.map((v, i) => ({ v, i }));

  const pricePosition = item.high_52w > item.low_52w
    ? ((item.price - item.low_52w) / (item.high_52w - item.low_52w)) * 100
    : 50;

  const verdictBadge =
    item.composite_score >= 80 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' :
    item.composite_score >= 65 ? 'bg-teal-500/20 text-teal-300 border-teal-500/50' :
    item.composite_score >= 35 ? 'bg-amber-500/20 text-amber-300 border-amber-500/50' :
    item.composite_score >= 20 ? 'bg-orange-500/20 text-orange-300 border-orange-500/50' :
    'bg-rose-500/20 text-rose-300 border-rose-500/50';

  return (
    <div className={`glass-panel rounded-2xl border transition-all duration-300 p-4 ${
      isBuy
        ? 'border-emerald-500/20 hover:border-emerald-500/50 bg-gradient-to-br from-emerald-950/25 via-slate-900/50 to-slate-950 hover:shadow-lg hover:shadow-emerald-950/30'
        : 'border-rose-500/20 hover:border-rose-500/50 bg-gradient-to-br from-rose-950/25 via-slate-900/50 to-slate-950 hover:shadow-lg hover:shadow-rose-950/30'
    }`}>
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
            rank <= 3
              ? (isBuy ? 'bg-gradient-to-tr from-emerald-600 to-teal-400 text-slate-950 shadow-md shadow-emerald-500/40' : 'bg-gradient-to-tr from-rose-600 to-orange-400 text-slate-950 shadow-md shadow-rose-500/40')
              : 'bg-slate-800/90 text-slate-400 border border-slate-700/60'
          }`}>
            #{rank}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-black text-white tracking-tight">{item.symbol}</span>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${verdictBadge}`}>
                {item.action_text || item.verdict}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 truncate mt-0.5 font-medium">{item.name}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-sm font-black text-white font-mono">{currency}{item.price.toFixed(2)}</div>
            <div className={`flex items-center justify-end gap-0.5 text-[10px] font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(item.change_pct).toFixed(2)}%
            </div>
          </div>
          <ScoreRing score={item.composite_score} />
        </div>
      </div>

      {/* Target Price Strategy Ribbon */}
      <div className="mt-3.5 grid grid-cols-3 gap-2 bg-slate-950/70 rounded-xl p-2.5 border border-slate-800/90 text-[10px]">
        <div>
          <div className="text-slate-500 text-[8px] uppercase tracking-wider font-bold">Buy Entry Zone</div>
          <div className="text-emerald-400 font-black mt-0.5 truncate font-mono">{item.targets.buy_zone}</div>
        </div>
        <div>
          <div className="text-slate-500 text-[8px] uppercase tracking-wider font-bold">Target Exit</div>
          <div className="text-indigo-300 font-black mt-0.5 truncate font-mono">{item.targets.exit_target}</div>
        </div>
        <div>
          <div className="text-slate-500 text-[8px] uppercase tracking-wider font-bold">Stop Loss</div>
          <div className="text-rose-400 font-black mt-0.5 truncate font-mono">{item.targets.stop_loss}</div>
        </div>
      </div>

      {/* Interactive Sparkline */}
      <div className="mt-3 h-12">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={sparkData}>
            <YAxis domain={['auto', 'auto']} hide />
            <Tooltip content={<SparkTooltip currency={currency} />} />
            <Line
              type="monotone"
              dataKey="v"
              stroke={isBuy ? '#10b981' : '#f43f5e'}
              strokeWidth={2.2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 52W Range Bar */}
      <div className="mt-2">
        <div className="flex justify-between text-[9px] text-slate-500 mb-1">
          <span>52W Low: {currency}{item.low_52w.toFixed(0)}</span>
          <span className="text-slate-400 font-semibold">52W Pos: {pricePosition.toFixed(0)}%</span>
          <span>52W High: {currency}{item.high_52w.toFixed(0)}</span>
        </div>
        <div className="relative h-1.5 bg-slate-800/80 rounded-full overflow-hidden">
          <div
            className={`absolute left-0 top-0 h-full rounded-full ${isBuy ? 'bg-emerald-500/50' : 'bg-rose-500/50'}`}
            style={{ width: `${Math.min(100, Math.max(0, pricePosition))}%` }}
          />
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full -ml-1 border border-slate-900 ${isBuy ? 'bg-emerald-400 shadow-md shadow-emerald-500/60' : 'bg-rose-400 shadow-md shadow-rose-500/60'}`}
            style={{ left: `${Math.min(97, Math.max(3, pricePosition))}%` }}
          />
        </div>
      </div>

      {/* Bottom Metrics Bar with Expand Toggle */}
      <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px]">
          <span className={`px-2 py-0.5 rounded-md font-bold ${
            item.rsi < 35 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
            item.rsi > 65 ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
            'bg-slate-800/90 text-slate-300 border border-slate-700/50'
          }`}>
            RSI {item.rsi.toFixed(0)}
          </span>
          <span className="text-slate-400 truncate max-w-[120px] font-medium">{item.macd_status}</span>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-[10px] text-amber-400 hover:text-amber-300 transition-all font-bold bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/30"
        >
          <span>5-Factor Model</span>
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Expanded Factor Breakdown Drawer */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-col gap-3 animate-fadeIn">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <FactorBar label="Technicals (30%)" score={item.scores.technicals} max={30} color="bg-cyan-400" />
            <FactorBar label="Fundamentals (20%)" score={item.scores.fundamentals} max={20} color="bg-indigo-400" />
            <FactorBar label="Macro & Sector (20%)" score={item.scores.macro} max={20} color="bg-amber-400" />
            <FactorBar label="News Sentiment (15%)" score={item.scores.sentiment} max={15} color="bg-emerald-400" />
            <FactorBar label="ML 30D Forecast (15%)" score={item.scores.ml} max={15} color="bg-purple-400" />
            <div className="flex flex-col justify-center text-[9px] text-slate-400 bg-slate-900/80 rounded-xl p-2 border border-slate-800">
              <div>P/E: <span className="text-white font-mono font-bold">{item.pe_ratio}</span></div>
              <div>EPS Grw: <span className="text-white font-mono font-bold">{item.eps_growth}</span></div>
              {item.ml_forecast_pct && (
                <div className="text-purple-300 font-bold mt-0.5">ML 30D: {item.ml_forecast_pct}</div>
              )}
            </div>
          </div>

          {/* Top Headlines if available */}
          {item.headlines && item.headlines.length > 0 && (
            <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/80">
              <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1.5 flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-400" /> Recent Catalysts & Headlines:
              </div>
              <div className="flex flex-col gap-1.5">
                {item.headlines.slice(0, 2).map((h, i) => (
                  <div key={i} className="text-[10px] text-slate-300 flex items-start gap-1.5 leading-tight">
                    <span className={`text-[8px] font-black px-1.5 py-0.2 rounded mt-0.5 ${
                      h.sentiment === 'Bullish' ? 'bg-emerald-500/20 text-emerald-300' :
                      h.sentiment === 'Bearish' ? 'bg-rose-500/20 text-rose-300' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {h.sentiment}
                    </span>
                    <span className="truncate">{h.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const NasdaqSignalsTab: React.FC<NasdaqSignalsTabProps> = ({ authFetch }) => {
  const [data, setData] = useState<{ buy: NasdaqSignalItem[]; sell: NasdaqSignalItem[]; top_pick: TopPickAnalysis | null } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'tech' | 'ml' | 'fund' | 'sent'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Custom Search Analysis State
  const [searchedSpotlight, setSearchedSpotlight] = useState<TopPickAnalysis | null>(null);
  const [searchedItem, setSearchedItem] = useState<NasdaqSignalItem | null>(null);
  const [isSearchingCustom, setIsSearchingCustom] = useState(false);
  const [searchError, setSearchError] = useState('');

  const fetchSignals = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setError('');
    try {
      const url = forceRefresh ? '/api/nasdaq-signals?refresh=true' : '/api/nasdaq-signals';
      const resp = await authFetch(url);
      if (!resp.ok) throw new Error('Failed to load NASDAQ signals');
      const json = await resp.json();
      setData(json);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchSignals(false);
  }, [fetchSignals]);

  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim().toUpperCase();
    if (!query) return;

    setSearchError('');
    setIsSearchingCustom(true);
    try {
      const resp = await authFetch(`/api/nasdaq-signals/analyze?symbol=${encodeURIComponent(query)}`);
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.detail || `Could not find stock '${query}'`);
      }
      const json = await resp.json();
      if (json.spotlight) {
        setSearchedSpotlight(json.spotlight);
        setSearchedItem(json.item);
        window.scrollTo({ top: 100, behavior: 'smooth' });
      }
    } catch (err: any) {
      setSearchError(err.message || `Failed to analyze stock '${query}'`);
    } finally {
      setIsSearchingCustom(false);
    }
  };

  const handleResetSpotlight = () => {
    setSearchedSpotlight(null);
    setSearchedItem(null);
    setSearchQuery('');
    setSearchError('');
  };

  // Active Spotlight (Searched custom stock OR #1 Top Conviction Pick)
  const activeSpotlight = searchedSpotlight || data?.top_pick;

  // Filtered & Sorted items
  const filteredBuy = useMemo(() => {
    if (!data?.buy) return [];
    let items = [...data.buy];
    if (searchedItem && searchedItem.composite_score >= 50 && !items.some(s => s.symbol === searchedItem.symbol)) {
      items = [searchedItem, ...items];
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(s => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    }
    if (activeFilter === 'tech') items.sort((a, b) => b.scores.technicals - a.scores.technicals);
    if (activeFilter === 'ml') items.sort((a, b) => b.scores.ml - a.scores.ml);
    if (activeFilter === 'fund') items.sort((a, b) => b.scores.fundamentals - a.scores.fundamentals);
    if (activeFilter === 'sent') items.sort((a, b) => b.scores.sentiment - a.scores.sentiment);
    return items;
  }, [data?.buy, activeFilter, searchQuery, searchedItem]);

  const filteredSell = useMemo(() => {
    if (!data?.sell) return [];
    let items = [...data.sell];
    if (searchedItem && searchedItem.composite_score < 50 && !items.some(s => s.symbol === searchedItem.symbol)) {
      items = [searchedItem, ...items];
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(s => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    }
    if (activeFilter === 'tech') items.sort((a, b) => a.scores.technicals - b.scores.technicals);
    if (activeFilter === 'ml') items.sort((a, b) => a.scores.ml - b.scores.ml);
    if (activeFilter === 'fund') items.sort((a, b) => a.scores.fundamentals - b.scores.fundamentals);
    if (activeFilter === 'sent') items.sort((a, b) => a.scores.sentiment - b.scores.sentiment);
    return items;
  }, [data?.sell, activeFilter, searchQuery, searchedItem]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel rounded-2xl p-5 border border-amber-500/20 bg-gradient-to-r from-slate-900/80 via-slate-900/60 to-amber-950/20">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500/30 to-brandBlue/30 border border-amber-500/40 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  NASDAQ Signals 2.0
                </h2>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Institutional Quant Model
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">
                Multi-Factor Engine: Technicals (30%) + Fundamentals (20%) + Macro (20%) + Sentiment (15%) + ML Forecast (15%)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {lastUpdated && (
            <span className="text-[11px] text-slate-400 font-mono">
              Synced {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => fetchSignals(true)}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-brandBlue/20 hover:from-amber-500/30 hover:to-brandBlue/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition-all shadow-lg shadow-amber-500/10 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
            {isLoading ? 'Recalculating Multi-Factor Scores...' : 'Refresh 20 Signals'}
          </button>
        </div>
      </div>

      {/* TOP ALPHA SPOTLIGHT HERO CARD */}
      {activeSpotlight && (
        <div className="relative overflow-hidden glass-panel rounded-3xl border-2 border-amber-500/50 bg-gradient-to-br from-amber-950/40 via-slate-900/70 to-slate-950 p-6 sm:p-7 shadow-2xl shadow-amber-950/40">
          <div className="absolute -top-16 -right-16 w-64 h-64 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          
          {/* Custom Search Reset Banner */}
          {searchedSpotlight && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-amber-500/15 border border-amber-500/40 rounded-2xl p-3 mb-5 backdrop-blur-md">
              <div className="flex items-center gap-2.5 text-xs text-amber-300 font-bold">
                <Search className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Custom Stock Analysis Spotlight: <strong className="text-white font-mono text-sm">{searchedSpotlight.symbol}</strong> ({searchedSpotlight.name})</span>
              </div>
              <button
                onClick={handleResetSpotlight}
                className="self-start sm:self-auto text-[11px] font-bold text-slate-300 hover:text-white bg-slate-900/90 hover:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 transition-all flex items-center gap-1.5"
              >
                <span>Reset to #1 Pick ({data?.top_pick?.symbol})</span>
                <span className="text-amber-400">✕</span>
              </button>
            </div>
          )}

          {/* Hero Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-amber-500/20">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                <Award className="w-5 h-5 text-amber-400 animate-pulse" />
              </div>
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                  {searchedSpotlight ? `Custom Searched Analysis: ${activeSpotlight.symbol}` : '#1 Top Alpha Conviction Pick'}
                </span>
                <div className="text-[11px] text-slate-400">
                  {searchedSpotlight ? 'Institutional multi-factor breakdown & trading targets' : 'Highest ranked institutional accumulation thesis'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-emerald-400 bg-emerald-500/20 px-3 py-1 rounded-full border border-emerald-500/40 shadow-md shadow-emerald-500/20">
                🟢 {activeSpotlight.action_text || 'STRONG BUY / ACCUMULATE NOW'}
              </span>
            </div>
          </div>

          {/* Hero Main Grid: Stock Identity + Strategy Targets + 5-Factor Radar Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            
            {/* Stock Identity (4 cols) */}
            <div className="lg:col-span-4 flex items-center gap-4 bg-slate-950/60 rounded-2xl p-4 border border-amber-500/30">
              <ScoreRing score={activeSpotlight.composite_score} size="large" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-2xl sm:text-3xl font-black text-white tracking-tight font-mono">{activeSpotlight.symbol}</span>
                  <span className="text-xs font-bold text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-md border border-amber-500/30">
                    {searchedSpotlight ? 'Custom Search' : 'Rank #1'}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-medium truncate mt-0.5">{activeSpotlight.name}</div>
                <div className="flex items-baseline gap-2 mt-1.5">
                  <span className="text-xl font-black text-emerald-400 font-mono">${activeSpotlight.price.toFixed(2)}</span>
                  {activeSpotlight.change_pct !== undefined && (
                    <span className={`text-xs font-bold font-mono ${activeSpotlight.change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {activeSpotlight.change_pct >= 0 ? '+' : ''}{activeSpotlight.change_pct.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Price Strategy Targets (4 cols) */}
            <div className="lg:col-span-4 grid grid-cols-3 gap-2 bg-slate-950/80 rounded-2xl p-3.5 border border-amber-500/40 text-center">
              <div className="flex flex-col justify-center">
                <div className="text-[9px] text-emerald-400/90 uppercase font-black tracking-wider">Buy Entry Zone</div>
                <div className="text-emerald-400 font-black mt-1 text-xs sm:text-sm font-mono truncate">{activeSpotlight.targets.buy_zone}</div>
                <div className="text-[8px] text-slate-500 mt-0.5">Support Accumulation</div>
              </div>
              <div className="flex flex-col justify-center border-x border-slate-800 px-1">
                <div className="text-[9px] text-indigo-400 uppercase font-black tracking-wider">Take Profit Target</div>
                <div className="text-indigo-300 font-black mt-1 text-xs sm:text-sm font-mono truncate">{activeSpotlight.targets.exit_target}</div>
                <div className="text-[8px] text-slate-500 mt-0.5">Resistance Exit</div>
              </div>
              <div className="flex flex-col justify-center">
                <div className="text-[9px] text-rose-400 uppercase font-black tracking-wider">Stop Loss Floor</div>
                <div className="text-rose-400 font-black mt-1 text-xs sm:text-sm font-mono truncate">{activeSpotlight.targets.stop_loss}</div>
                <div className="text-[8px] text-slate-500 mt-0.5">Risk Protection</div>
              </div>
            </div>

            {/* 5-Factor Progress Breakdown (4 cols) */}
            <div className="lg:col-span-4 flex flex-col gap-2 bg-slate-950/60 rounded-2xl p-3.5 border border-slate-800/90">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center justify-between mb-1">
                <span>5-Factor Model Breakdown</span>
                <span className="text-amber-400 font-black">{activeSpotlight.composite_score}/100</span>
              </div>
              <FactorBar label="Technicals Setup (30%)" score={activeSpotlight.scores.technicals} max={30} color="bg-cyan-400" />
              <FactorBar label="Fundamentals & Valuation (20%)" score={activeSpotlight.scores.fundamentals} max={20} color="bg-indigo-400" />
              <FactorBar label="Macro & Sector (20%)" score={activeSpotlight.scores.macro} max={20} color="bg-amber-400" />
              <FactorBar label="News Sentiment (15%)" score={activeSpotlight.scores.sentiment} max={15} color="bg-emerald-400" />
              <FactorBar label="ML 30D Forecast (15%)" score={activeSpotlight.scores.ml} max={15} color="bg-purple-400" />
            </div>
          </div>

          {/* Interactive Price Chart with Entry & Exit Bands */}
          {activeSpotlight.chart_data && activeSpotlight.chart_data.length > 0 && (
            <div className="mt-6 bg-slate-950/80 rounded-2xl p-4 sm:p-5 border border-slate-800/90">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wide">
                    60-Day Price Trend & Dynamic Action Bands
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[10px] flex-wrap font-semibold">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> Price
                  </span>
                  <span className="flex items-center gap-1.5 text-indigo-400">
                    <span className="w-2.5 h-0.5 bg-indigo-400 inline-block" /> Exit Target ({activeSpotlight.targets.exit_target})
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-300">
                    <span className="w-2.5 h-0.5 bg-emerald-400 inline-block" /> Buy Zone ({activeSpotlight.targets.buy_zone})
                  </span>
                  <span className="flex items-center gap-1.5 text-rose-400">
                    <span className="w-2.5 h-0.5 bg-rose-400 inline-block" /> Stop Loss ({activeSpotlight.targets.stop_loss})
                  </span>
                </div>
              </div>

              <div className="h-56 sm:h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={activeSpotlight.chart_data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="date" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} />
                    <YAxis domain={['auto', 'auto']} stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} />
                    <Tooltip content={<TopPickChartTooltip />} />
                    {activeSpotlight.targets.exit_target_val && (
                      <ReferenceLine y={activeSpotlight.targets.exit_target_val} stroke="#818cf8" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Target Exit', fill: '#818cf8', fontSize: 10, position: 'insideTopRight' }} />
                    )}
                    {activeSpotlight.targets.buy_zone_high && (
                      <ReferenceLine y={activeSpotlight.targets.buy_zone_high} stroke="#34d399" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: 'Buy Zone High', fill: '#34d399', fontSize: 10, position: 'insideRight' }} />
                    )}
                    {activeSpotlight.targets.stop_loss_val && (
                      <ReferenceLine y={activeSpotlight.targets.stop_loss_val} stroke="#f43f5e" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Stop Loss', fill: '#f43f5e', fontSize: 10, position: 'insideBottomRight' }} />
                    )}
                    <Area type="monotone" dataKey="price" stroke="#10b981" strokeWidth={2.5} fillOpacity={0.15} fill="#10b981" isAnimationActive={false} />
                    <Line type="monotone" dataKey="upper_band" stroke="#6366f1" strokeWidth={1.2} strokeDasharray="2 2" dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="lower_band" stroke="#059669" strokeWidth={1.2} strokeDasharray="2 2" dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Thesis Narrative + Catalysts vs Risks Columns */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Thesis Narrative (2 cols) */}
            <div className="lg:col-span-2 bg-slate-950/60 rounded-2xl p-4 sm:p-5 border border-amber-500/20 text-xs text-slate-300 leading-relaxed">
              <span className="font-black text-amber-400 flex items-center gap-1.5 mb-2 text-sm">
                <Sparkles className="w-4 h-4 text-amber-400" /> Full Quantitative Investment Thesis:
              </span>
              <p className="text-slate-200 leading-normal text-xs sm:text-sm">
                {activeSpotlight.thesis.replace(/\*\*/g, '')}
              </p>
            </div>

            {/* Key Catalysts & Risks (1 col) */}
            <div className="flex flex-col gap-3">
              {activeSpotlight.catalysts && activeSpotlight.catalysts.length > 0 && (
                <div className="bg-emerald-950/30 rounded-2xl p-3.5 border border-emerald-500/30">
                  <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-2">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Key Bullish Catalysts:
                  </div>
                  <ul className="space-y-1.5 text-[11px] text-slate-300">
                    {activeSpotlight.catalysts.map((cat, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-emerald-400 font-bold">•</span>
                        <span>{cat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {activeSpotlight.risks && activeSpotlight.risks.length > 0 && (
                <div className="bg-rose-950/30 rounded-2xl p-3.5 border border-rose-500/30">
                  <div className="text-[10px] font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5 mb-2">
                    <ShieldAlert className="w-3.5 h-3.5" /> Risk Management & Stop-Loss:
                  </div>
                  <ul className="space-y-1.5 text-[11px] text-slate-300">
                    {activeSpotlight.risks.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-rose-400 font-bold">•</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 glass-panel rounded-2xl p-3.5 border border-slate-800/80">
        {/* Factor Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mr-1 shrink-0 flex items-center gap-1">
            <SlidersHorizontal className="w-3 h-3" /> Factor:
          </span>
          {[
            { id: 'all', label: 'All Multi-Factor' },
            { id: 'tech', label: 'Top Technicals (30%)' },
            { id: 'ml', label: 'Top ML Forecast (15%)' },
            { id: 'fund', label: 'Best Value Fund. (20%)' },
            { id: 'sent', label: 'Top Sentiment (15%)' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeFilter === f.id
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                  : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Dynamic Stock Search Form */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 min-w-[240px] sm:min-w-[320px]">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search any stock (e.g. PLTR, NVDA, BABA, TSLA)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={isSearchingCustom || !searchQuery.trim()}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            {isSearchingCustom ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-slate-950 fill-slate-950" />
            )}
            <span>{isSearchingCustom ? 'Analyzing...' : 'Analyze'}</span>
          </button>
        </form>
      </div>

      {/* Search Error Notice */}
      {searchError && (
        <div className="glass-panel rounded-2xl border border-rose-500/40 p-3.5 text-rose-400 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{searchError}</span>
          </div>
          <button onClick={() => setSearchError('')} className="text-slate-400 hover:text-white font-bold px-2 py-0.5">✕</button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && !data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {['buy', 'sell'].map(col => (
            <div key={col} className="flex flex-col gap-3">
              <div className="h-10 w-full bg-slate-800/60 rounded-xl animate-pulse" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass-panel rounded-2xl border border-slate-800 p-4 h-40 animate-pulse bg-slate-900/40" />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Error Notice */}
      {error && (
        <div className="glass-panel rounded-2xl border border-rose-500/40 p-5 text-rose-400 text-xs text-center flex flex-col items-center gap-2">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => fetchSignals(true)} className="px-4 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold transition-all">
            Retry Quantitative Scan
          </button>
        </div>
      )}

      {/* Dual Ranked Columns: Top 10 Buy vs Top 10 Sell */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* BUY COLUMN */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between bg-gradient-to-r from-emerald-950/60 to-slate-900/60 border border-emerald-500/30 rounded-2xl p-3.5 shadow-lg shadow-emerald-950/20">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-emerald-400 uppercase tracking-wider">Top 10 — BUY & ACCUMULATE</h3>
                  <p className="text-[10px] text-slate-400">Institutional Accumulation Zone (Composite Score 65–100)</p>
                </div>
              </div>
              <span className="text-xs font-black text-emerald-400 bg-emerald-500/20 px-3 py-1 rounded-xl border border-emerald-500/40">
                {filteredBuy.length} Picks
              </span>
            </div>

            <div className="flex flex-col gap-3.5">
              {filteredBuy.length > 0 ? (
                filteredBuy.map((item, idx) => (
                  <SignalCard key={item.symbol} item={item} type="buy" rank={idx + 1} />
                ))
              ) : (
                <div className="glass-panel rounded-2xl p-6 text-center text-xs text-slate-500">
                  No stocks match the search query in the Buy list.
                </div>
              )}
            </div>
          </div>

          {/* SELL / PROFIT BOOKING COLUMN */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between bg-gradient-to-r from-rose-950/60 to-slate-900/60 border border-rose-500/30 rounded-2xl p-3.5 shadow-lg shadow-rose-950/20">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center">
                  <TrendingDown className="w-4 h-4 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-rose-400 uppercase tracking-wider">Top 10 — SELL & BOOK PROFIT</h3>
                  <p className="text-[10px] text-slate-400">Overextended / Distribution Zone (Score &lt; 35)</p>
                </div>
              </div>
              <span className="text-xs font-black text-rose-400 bg-rose-500/20 px-3 py-1 rounded-xl border border-rose-500/40">
                {filteredSell.length} Picks
              </span>
            </div>

            <div className="flex flex-col gap-3.5">
              {filteredSell.length > 0 ? (
                filteredSell.map((item, idx) => (
                  <SignalCard key={item.symbol} item={item} type="sell" rank={idx + 1} />
                ))
              ) : (
                <div className="glass-panel rounded-2xl p-6 text-center text-xs text-slate-500">
                  No stocks match the search query in the Sell list.
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
