import React, { useState } from 'react';
import { 
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  Legend, ReferenceLine, Cell
} from 'recharts';
import { 
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, 
  Activity, ArrowUpRight, ArrowDownRight, Info, ShieldAlert, Sparkles
} from 'lucide-react';

interface Recommendation {
  verdict: 'INVEST' | 'BOOK PROFIT' | 'HOLD';
  rsi_status: string;
  macd_status: string;
  volume_status: string;
  summary: string;
}

interface ChartPoint {
  time: string;
  close: number;
  trend: number;
  upper_band: number;
  lower_band: number;
  rsi: number;
  macd: number;
  macd_signal: number;
  macd_hist: number;
  volume: number;
  volume_ma: number;
  buy_zone: boolean;
  sell_zone: boolean;
}

interface WhenToInvestTabProps {
  symbol: string;
  analysis: {
    symbol: string;
    chart_data: ChartPoint[];
    recommendation: Recommendation;
  } | null;
  isLoading: boolean;
}

export const WhenToInvestTab: React.FC<WhenToInvestTabProps> = ({ symbol, analysis, isLoading }) => {
  const [activeChartGroup, setActiveChartGroup] = useState<'all' | 'price' | 'rsi' | 'macd' | 'volume'>('all');
  const isIndian = symbol.endsWith('.NS') || symbol.endsWith('.BO');
  const currencySymbol = isIndian ? '₹' : '$';

  if (isLoading) {
    return (
      <div className="h-[500px] glass-panel rounded-2xl border border-darkBorder/60 flex flex-col items-center justify-center text-xs text-slate-500 gap-3">
        <Activity className="w-8 h-8 animate-spin text-brandBlue" />
        <span className="font-bold text-slate-300">Running technical envelopes & circuit simulation...</span>
        <span className="text-[10px] text-slate-500">Computing 20-day standard deviations, linear trend regressions, RSI and MACD crossovers</span>
      </div>
    );
  }

  if (!analysis || !analysis.chart_data || analysis.chart_data.length === 0) {
    return (
      <div className="glass-panel rounded-2xl border border-darkBorder/60 p-8 text-center text-xs text-slate-500">
        <ShieldAlert className="w-8 h-8 text-brandRed mx-auto mb-3" />
        <span className="font-semibold block text-slate-300">Technical analysis failed for {symbol}.</span>
        <span className="text-[10px] text-slate-500 mt-1 block">Insufficient historical daily trading records available.</span>
      </div>
    );
  }

  const { recommendation, chart_data } = analysis;
  const verdict = recommendation.verdict;

  // Formatting utils
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  const formatLargeNumber = (val: number) => {
    if (val >= 1.0e9) return (val / 1.0e9).toFixed(2) + 'B';
    if (val >= 1.0e6) return (val / 1.0e6).toFixed(2) + 'M';
    if (val >= 1.0e3) return (val / 1.0e3).toFixed(1) + 'K';
    return val.toString();
  };

  // Verdict style mapping
  const verdictStyles = {
    INVEST: {
      bg: 'bg-emerald-500/10 border-emerald-500/30',
      text: 'text-emerald-400',
      border: 'border-emerald-500/20',
      icon: <CheckCircle2 className="w-6 h-6 text-emerald-400" />,
      badge: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
    },
    'BOOK PROFIT': {
      bg: 'bg-rose-500/10 border-rose-500/30',
      text: 'text-rose-400',
      border: 'border-rose-500/20',
      icon: <AlertTriangle className="w-6 h-6 text-rose-400" />,
      badge: 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
    },
    HOLD: {
      bg: 'bg-slate-500/10 border-slate-500/30',
      text: 'text-slate-300',
      border: 'border-slate-500/20',
      icon: <Activity className="w-6 h-6 text-slate-300" />,
      badge: 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
    }
  }[verdict];

  // Custom tooltips for Recharts
  const CustomPriceTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as ChartPoint;
      const isBuy = data.close <= data.lower_band;
      const isSell = data.close >= data.upper_band;
      
      return (
        <div className="bg-darkCard border border-darkBorder/80 p-3 rounded-xl shadow-xl text-xs max-w-[220px]">
          <p className="font-bold text-slate-400 mb-1">{label}</p>
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between gap-4">
              <span className="text-white font-semibold">Close Price:</span>
              <span className="text-brandBlue font-bold">{currencySymbol}{data.close.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Trend Line:</span>
              <span className="text-slate-300 font-medium">{currencySymbol}{data.trend.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-rose-500">Upper Circuit:</span>
              <span className="text-rose-400 font-medium">{currencySymbol}{data.upper_band.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-emerald-500">Lower Circuit:</span>
              <span className="text-emerald-400 font-medium">{currencySymbol}{data.lower_band.toFixed(2)}</span>
            </div>
            {isBuy && (
              <div className="mt-2 text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold text-center">
                BUY / ACCUMULATION ZONE
              </div>
            )}
            {isSell && (
              <div className="mt-2 text-[9px] bg-rose-500/15 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded font-bold text-center">
                PROFIT BOOKING ZONE
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomRSITooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const val = payload[0].value;
      const status = val > 70 ? 'Overbought' : val < 30 ? 'Oversold' : 'Neutral';
      const colorClass = val > 70 ? 'text-rose-400' : val < 30 ? 'text-emerald-400' : 'text-slate-300';
      return (
        <div className="bg-darkCard border border-darkBorder/80 p-2.5 rounded-xl shadow-xl text-xs">
          <p className="font-bold text-slate-400 mb-1">{label}</p>
          <div className="flex justify-between gap-4">
            <span className="text-white">RSI (14):</span>
            <span className={`font-bold ${colorClass}`}>{val.toFixed(2)} ({status})</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomMACDTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-darkCard border border-darkBorder/80 p-2.5 rounded-xl shadow-xl text-xs flex flex-col gap-1">
          <p className="font-bold text-slate-400 mb-1">{label}</p>
          <div className="flex justify-between gap-4">
            <span className="text-violet-400 font-semibold">MACD Line:</span>
            <span className="text-slate-200">{data.macd.toFixed(3)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-amber-400 font-semibold">Signal Line:</span>
            <span className="text-slate-200">{data.macd_signal.toFixed(3)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-indigo-400 font-semibold">Histogram:</span>
            <span className={data.macd_hist >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {data.macd_hist.toFixed(3)}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomVolTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const ratio = data.volume / (data.volume_ma || 1);
      return (
        <div className="bg-darkCard border border-darkBorder/80 p-2.5 rounded-xl shadow-xl text-xs flex flex-col gap-1">
          <p className="font-bold text-slate-400 mb-1">{label}</p>
          <div className="flex justify-between gap-4">
            <span className="text-white">Volume:</span>
            <span className="text-brandBlue font-bold">{formatLargeNumber(data.volume)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">20-day MA:</span>
            <span className="text-slate-300">{formatLargeNumber(Math.round(data.volume_ma))}</span>
          </div>
          <div className="flex justify-between gap-4 border-t border-darkBorder/40 pt-1 mt-1">
            <span className="text-slate-400">Volume Ratio:</span>
            <span className={`font-semibold ${ratio > 1.5 ? 'text-emerald-400' : 'text-slate-300'}`}>
              {ratio.toFixed(2)}x
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-5">
      {/* 1. RECOMMENDATION DASHBOARD CARD */}
      <div className={`glass-panel border rounded-3xl p-5 md:p-6 shadow-xl transition-all ${verdictStyles.bg}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-darkBorder/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-2xl bg-darkCard/40 border border-white/5">
              {verdictStyles.icon}
            </div>
            <div>
              <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Trading Action Recommendation</h4>
              <h2 className={`text-xl md:text-2xl font-black tracking-tight flex items-center gap-2 ${verdictStyles.text}`}>
                {verdict}
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide border ${verdictStyles.badge}`}>
                  Active Regime
                </span>
              </h2>
            </div>
          </div>
          
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-darkCard/40 border border-darkBorder/60 px-3 py-2 rounded-xl text-center">
              <span className="block text-[8px] text-slate-500 font-bold uppercase">RSI (14)</span>
              <span className={`text-xs font-black ${
                recommendation.rsi_status.includes('Oversold') 
                  ? 'text-emerald-400' 
                  : recommendation.rsi_status.includes('Overbought') 
                    ? 'text-rose-400' 
                    : 'text-slate-300'
              }`}>{recommendation.rsi_status}</span>
            </div>
            
            <div className="bg-darkCard/40 border border-darkBorder/60 px-3 py-2 rounded-xl text-center">
              <span className="block text-[8px] text-slate-500 font-bold uppercase">MACD</span>
              <span className={`text-xs font-black ${
                recommendation.macd_status.includes('Bullish') ? 'text-emerald-400' : 'text-rose-400'
              }`}>{recommendation.macd_status}</span>
            </div>
            
            <div className="bg-darkCard/40 border border-darkBorder/60 px-3 py-2 rounded-xl text-center">
              <span className="block text-[8px] text-slate-500 font-bold uppercase">Vol Activity</span>
              <span className={`text-xs font-black ${
                recommendation.volume_status.includes('High') ? 'text-emerald-400' : 'text-slate-300'
              }`}>{recommendation.volume_status}</span>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed font-medium">
            <Info className="w-4 h-4 text-brandBlue shrink-0 mt-0.5" />
            <p>{recommendation.summary}</p>
          </div>
        </div>
      </div>

      {/* CHART CONTROL BAR */}
      <div className="flex justify-between items-center bg-darkCard/60 border border-darkBorder/60 p-2.5 rounded-2xl gap-3">
        <span className="text-xs font-bold text-white px-1">Technical Indicators Chart Engine</span>
        <div className="flex bg-slate-900/60 p-0.5 rounded-xl border border-darkBorder/40 overflow-hidden shrink-0">
          {(['all', 'price', 'rsi', 'macd', 'volume'] as const).map((view) => (
            <button
              key={view}
              onClick={() => setActiveChartGroup(view)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase transition-all ${
                activeChartGroup === view
                  ? 'bg-brandBlue text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      {/* 2. PRICE AND BAND GRAPH */}
      {(activeChartGroup === 'all' || activeChartGroup === 'price') && (
        <div className="glass-panel rounded-2xl border border-darkBorder/60 p-5 flex flex-col gap-4">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dynamic Envelopes & Circuits</h3>
            <h2 className="text-base font-extrabold text-white mt-0.5 flex items-center gap-1.5">
              <span>📊 Primary Trend & Volatility Bands</span>
              <span className="text-[9px] bg-brandBlue/15 text-brandBlue border border-brandBlue/35 px-2 py-0.5 rounded font-black">
                2-Standard-Deviation BB
              </span>
            </h2>
          </div>
          
          <div className="w-full h-[280px] md:h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart_data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="#475569" 
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis 
                  stroke="#475569" 
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                  dx={-10}
                  domain={['auto', 'auto']}
                  tickFormatter={(val) => `${currencySymbol}${val}`}
                />
                <Tooltip content={<CustomPriceTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                
                {/* Upper Band (Dotted Resistance) */}
                <Line 
                  name="Upper Circuit Band (Resistance)"
                  type="monotone"
                  dataKey="upper_band"
                  stroke="#EF4444"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={false}
                />
                
                {/* Trend Line */}
                <Line 
                  name="Primary Trend Line"
                  type="monotone"
                  dataKey="trend"
                  stroke="#64748B"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={false}
                />

                {/* Price Line */}
                <Line 
                  name="Stock Price"
                  type="monotone"
                  dataKey="close"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (payload.buy_zone) {
                      return <circle cx={cx} cy={cy} r={4} fill="#10B981" stroke="#fff" strokeWidth={1} />;
                    }
                    if (payload.sell_zone) {
                      return <circle cx={cx} cy={cy} r={4} fill="#EF4444" stroke="#fff" strokeWidth={1} />;
                    }
                    return <></>;
                  }}
                  activeDot={{ r: 6, fill: '#3B82F6', stroke: '#fff', strokeWidth: 1.5 }}
                />

                {/* Lower Band (Dotted Support) */}
                <Line 
                  name="Lower Circuit Band (Support)"
                  type="monotone"
                  dataKey="lower_band"
                  stroke="#10B981"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 3. RSI SUBPLOT */}
      {(activeChartGroup === 'all' || activeChartGroup === 'rsi') && (
        <div className="glass-panel rounded-2xl border border-darkBorder/60 p-4 md:p-5 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Momentum Oscillator</h3>
              <h2 className="text-sm font-extrabold text-white mt-0.5">⏱️ Relative Strength Index (RSI 14)</h2>
            </div>
            <span className="text-[10px] font-bold text-slate-400">Overbought: &gt;70 | Oversold: &lt;30</span>
          </div>

          <div className="w-full h-[120px] md:h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart_data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="#475569" 
                  fontSize={8}
                  tickLine={false}
                  axisLine={false}
                  dy={5}
                />
                <YAxis 
                  stroke="#475569" 
                  fontSize={8}
                  tickLine={false}
                  axisLine={false}
                  dx={-10}
                  domain={[10, 90]}
                  ticks={[30, 50, 70]}
                />
                <Tooltip content={<CustomRSITooltip />} />
                
                {/* Reference lines for Overbought & Oversold */}
                <ReferenceLine y={70} stroke="#EF4444" strokeDasharray="3 3" strokeWidth={1} label={{ value: 'OB', fill: '#EF4444', fontSize: 8, position: 'right' }} />
                <ReferenceLine y={30} stroke="#10B981" strokeDasharray="3 3" strokeWidth={1} label={{ value: 'OS', fill: '#10B981', fontSize: 8, position: 'right' }} />
                <ReferenceLine y={50} stroke="#475569" strokeDasharray="4 4" strokeWidth={0.5} />
                
                <Line 
                  name="RSI (14)"
                  type="monotone"
                  dataKey="rsi"
                  stroke="#A855F7"
                  strokeWidth={1.8}
                  dot={false}
                  activeDot={{ r: 5, fill: '#A855F7' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 4. MACD SUBPLOT */}
      {(activeChartGroup === 'all' || activeChartGroup === 'macd') && (
        <div className="glass-panel rounded-2xl border border-darkBorder/60 p-4 md:p-5 flex flex-col gap-3">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Momentum Confirmation</h3>
            <h2 className="text-sm font-extrabold text-white mt-0.5">⚡ Moving Average Convergence Divergence (MACD 12, 26, 9)</h2>
          </div>

          <div className="w-full h-[140px] md:h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart_data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="#475569" 
                  fontSize={8}
                  tickLine={false}
                  axisLine={false}
                  dy={5}
                />
                <YAxis 
                  stroke="#475569" 
                  fontSize={8}
                  tickLine={false}
                  axisLine={false}
                  dx={-10}
                  domain={['auto', 'auto']}
                />
                <Tooltip content={<CustomMACDTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '9px', paddingTop: '5px' }} />
                
                {/* MACD Histogram */}
                <Bar name="MACD Histogram" dataKey="macd_hist">
                  {chart_data.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.macd_hist >= 0 ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)'}
                      stroke={entry.macd_hist >= 0 ? '#10B981' : '#EF4444'}
                      strokeWidth={1}
                    />
                  ))}
                </Bar>
                
                {/* MACD Line */}
                <Line 
                  name="MACD"
                  type="monotone"
                  dataKey="macd"
                  stroke="#3B82F6"
                  strokeWidth={1.5}
                  dot={false}
                />
                
                {/* Signal Line */}
                <Line 
                  name="Signal"
                  type="monotone"
                  dataKey="macd_signal"
                  stroke="#F59E0B"
                  strokeWidth={1.5}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 5. VOLUME SUBPLOT */}
      {(activeChartGroup === 'all' || activeChartGroup === 'volume') && (
        <div className="glass-panel rounded-2xl border border-darkBorder/60 p-4 md:p-5 flex flex-col gap-3">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Volume Trend Analysis</h3>
            <h2 className="text-sm font-extrabold text-white mt-0.5">📊 Institutional Activity Validation (Volume vs. 20d MA)</h2>
          </div>

          <div className="w-full h-[120px] md:h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart_data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="#475569" 
                  fontSize={8}
                  tickLine={false}
                  axisLine={false}
                  dy={5}
                />
                <YAxis 
                  stroke="#475569" 
                  fontSize={8}
                  tickLine={false}
                  axisLine={false}
                  dx={-10}
                  domain={[0, 'auto']}
                  tickFormatter={formatLargeNumber}
                />
                <Tooltip content={<CustomVolTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '9px', paddingTop: '5px' }} />
                
                <Bar name="Volume" dataKey="volume" fill="rgba(59, 130, 246, 0.3)" />
                <Line 
                  name="Volume 20d MA"
                  type="monotone"
                  dataKey="volume_ma"
                  stroke="#3B82F6"
                  strokeWidth={1.5}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
