import React, { useState } from 'react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  BarChart, Bar, Cell, LineChart, Line, ReferenceLine
} from 'recharts';
import { 
  TrendingUp, TrendingDown, AlertTriangle, ShieldAlert, CheckCircle2, 
  HelpCircle, Landmark, Wallet, Percent, DollarSign, Award, Target, Activity
} from 'lucide-react';

interface MoatFactors {
  brand_strength: number;
  distribution_network: number;
  switching_costs: number;
  cost_advantage: number;
  tech_advantage: number;
}

interface FinancialPoint {
  year: string;
  revenue_growth: number;
  pat_growth: number;
  operating_margin: number;
  roe: number;
  roce: number;
  debt_to_equity: number;
}

interface ValuationMetrics {
  pe: number;
  pe_peer_avg: number;
  ev_ebitda: number;
  ev_ebitda_peer_avg: number;
  dcf_estimate: number;
  current_price: number;
  historical_pe_min: number;
  historical_pe_max: number;
}

interface RiskItem {
  name: string;
  level: 'High' | 'Medium' | 'Low';
  description: string;
}

interface Scenarios {
  current_price: number;
  bear_case_12m: number;
  base_case_12m: number;
  bull_case_12m: number;
  bear_case_24m: number;
  base_case_24m: number;
  bull_case_24m: number;
}

interface InvestmentAnalysis {
  verdict: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  justification: string;
  moat_rating: number;
  moat_explanation: string;
  moat_factors: MoatFactors;
  financials_status: 'Strengthening' | 'Weakening' | 'Stable';
  financials_explanation: string;
  financial_history: FinancialPoint[];
  valuation_status: 'Undervalued' | 'Fairly Valued' | 'Overvalued';
  valuation_explanation: string;
  valuation_metrics: ValuationMetrics;
  risks: RiskItem[];
  scenarios: Scenarios;
  full_analysis: {
    business_model: string;
    industry_trends: string;
    promoter_holdings: string;
    outlook: string;
  };
}

interface ShouldIInvestTabProps {
  symbol: string;
  analysis: InvestmentAnalysis | null;
  isLoading: boolean;
}

export const ShouldIInvestTab: React.FC<ShouldIInvestTabProps> = ({ symbol, analysis, isLoading }) => {
  const [subTab, setSubTab] = useState<'overview' | 'financials' | 'valuation' | 'risks'>('overview');

  if (isLoading) {
    return (
      <div className="h-[500px] glass-panel rounded-2xl border border-darkBorder/60 flex flex-col items-center justify-center text-xs text-slate-500 gap-3">
        <Activity className="w-8 h-8 animate-spin text-emerald-500" />
        <span className="font-bold text-slate-300">Evaluating equity filings & conducting risk scenarios...</span>
        <span className="text-[10px] text-slate-500">Retrieving annual files, promoter holding shifts, and peer P/E averages</span>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="glass-panel rounded-2xl border border-darkBorder/60 p-8 text-center text-xs text-slate-500">
        Analysis data is currently unavailable. Please verify connection and try a different symbol.
      </div>
    );
  }

  // Parse color and icon states based on verdict
  const isBuy = analysis.verdict === 'BUY';
  const isSell = analysis.verdict === 'SELL';
  const verdictColor = isBuy ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : isSell ? 'text-rose-400 bg-rose-500/10 border-rose-500/30' : 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  const VerdictIcon = isBuy ? CheckCircle2 : isSell ? ShieldAlert : AlertTriangle;

  // Moat factor chart conversion
  const moatChartData = [
    { name: 'Brand Power', score: analysis.moat_factors.brand_strength, fill: '#10B981' },
    { name: 'Distribution Network', score: analysis.moat_factors.distribution_network, fill: '#3B82F6' },
    { name: 'Switching Costs', score: analysis.moat_factors.switching_costs, fill: '#8B5CF6' },
    { name: 'Cost Advantage', score: analysis.moat_factors.cost_advantage, fill: '#F59E0B' },
    { name: 'Proprietary Tech', score: analysis.moat_factors.tech_advantage, fill: '#EC4899' }
  ];

  // Peer PE/Valuation chart data
  const peerValData = [
    { name: `${symbol} (Current)`, value: analysis.valuation_metrics.pe, type: 'PE' },
    { name: 'Sector Average', value: analysis.valuation_metrics.pe_peer_avg, type: 'PE' },
    { name: `${symbol} EV/EBITDA`, value: analysis.valuation_metrics.ev_ebitda, type: 'EV' },
    { name: 'Sector EV/EBITDA', value: analysis.valuation_metrics.ev_ebitda_peer_avg, type: 'EV' }
  ];

  // Scenario forecasting data transformation
  const scenariosChartData = [
    { name: 'Current', Bear: analysis.scenarios.current_price, Base: analysis.scenarios.current_price, Bull: analysis.scenarios.current_price },
    { name: '12-Month Outlook', Bear: analysis.scenarios.bear_case_12m, Base: analysis.scenarios.base_case_12m, Bull: analysis.scenarios.bull_case_12m },
    { name: '24-Month Outlook', Bear: analysis.scenarios.bear_case_24m, Base: analysis.scenarios.base_case_24m, Bull: analysis.scenarios.bull_case_24m }
  ];

  const isIndian = symbol.endsWith('.NS') || symbol.endsWith('.BO');
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat(isIndian ? 'en-IN' : 'en-US', { 
      style: 'currency', 
      currency: isIndian ? 'INR' : 'USD', 
      maximumFractionDigits: 0 
    }).format(val);
  };

  const getRiskBadgeColor = (level: string) => {
    switch (level) {
      case 'High': return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      case 'Medium': return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      default: return 'text-slate-400 bg-slate-800 border-slate-700';
    }
  };

  // Helper for rendering custom markdown strings inside elements
  const formatMarkdown = (text: string) => {
    if (!text) return null;
    return text.split('\n').map((para, i) => {
      if (!para.trim()) return null;
      let cleanPara = para.replace(/\*\*(.*?)\*\*/g, '$1'); // Strip bold syntax for cleaner view
      return <p key={i} className="mb-2 last:mb-0 text-justify">{cleanPara}</p>;
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ================= VERDICT BANNER CARD ================= */}
      <div className="glass-panel border border-darkBorder/60 rounded-2xl p-5 relative overflow-hidden flex flex-col md:flex-row items-center gap-6 shadow-xl">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-emerald-500/5 to-transparent pointer-events-none rounded-bl-full"></div>
        
        {/* Speedometer Radial Gauge */}
        <div className="flex flex-col items-center shrink-0">
          <div className="relative w-28 h-28 flex items-center justify-center">
            {/* SVG circular track */}
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="56" cy="56" r="46" stroke="#101524" strokeWidth="8" fill="transparent" />
              <circle 
                cx="56" 
                cy="56" 
                r="46" 
                stroke={isBuy ? '#10B981' : isSell ? '#EF4444' : '#F59E0B'} 
                strokeWidth="8" 
                fill="transparent" 
                strokeDasharray="289"
                strokeDashoffset={289 - (289 * analysis.confidence) / 100}
                className="transition-all duration-1000 ease-out"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-black text-white">{analysis.confidence}%</span>
              <span className="text-[8px] text-slate-500 font-extrabold uppercase tracking-widest">Confidence</span>
            </div>
          </div>
        </div>

        {/* Verdict Badge and Justification */}
        <div className="flex-1 min-w-0 flex flex-col items-center md:items-start text-center md:text-left">
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Decision Indicator</span>
            <div className={`px-3.5 py-1 rounded-full border text-xs font-black flex items-center gap-1.5 uppercase ${verdictColor}`}>
              <VerdictIcon className="w-3.5 h-3.5" />
              <span>{analysis.verdict} VERDICT</span>
            </div>
          </div>

          <h2 className="text-sm font-bold text-white mt-3 leading-relaxed max-w-2xl text-justify md:text-left">
            {analysis.justification}
          </h2>
        </div>
      </div>

      {/* ================= SUB-NAVIGATION BAR ================= */}
      <div className="flex bg-darkCard border border-darkBorder/60 p-1 rounded-xl gap-1.5 shrink-0">
        {[
          { id: 'overview', label: 'Overview & Moat', icon: Award },
          { id: 'financials', label: 'Financial Health', icon: Landmark },
          { id: 'valuation', label: 'Valuation & Peers', icon: DollarSign },
          { id: 'risks', label: 'Risks & Scenarios', icon: AlertTriangle }
        ].map((tab) => {
          const Icon = tab.icon;
          const isSelected = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id as any)}
              className={`flex-1 py-2 rounded-lg font-bold text-[10px] sm:text-xs flex items-center justify-center gap-1.5 transition-all ${
                isSelected
                  ? 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </div>

      {/* ================= SUB-TABS VIEWS ================= */}
      
      {/* 1. OVERVIEW & COMPETITIVE MOAT */}
      {subTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Text Analysis */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="glass-panel border border-darkBorder/60 rounded-2xl p-5">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-darkBorder/30 pb-2 mb-3">Business Model & Moat</h3>
              <div className="text-xs text-slate-300 leading-relaxed space-y-3">
                {formatMarkdown(analysis.full_analysis.business_model)}
                <div className="mt-3 p-3.5 bg-slate-950/40 border border-darkBorder/30 rounded-xl">
                  <div className="flex items-center gap-2 text-xs font-bold text-white mb-2">
                    <Award className="w-4 h-4 text-emerald-400" />
                    <span>Moat Strength Evaluation</span>
                  </div>
                  {formatMarkdown(analysis.moat_explanation)}
                </div>
              </div>
            </div>

            <div className="glass-panel border border-darkBorder/60 rounded-2xl p-5">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-darkBorder/30 pb-2 mb-3">Industry Trends & Holdings</h3>
              <div className="text-xs text-slate-300 leading-relaxed space-y-3">
                {formatMarkdown(analysis.full_analysis.industry_trends)}
                {formatMarkdown(analysis.full_analysis.promoter_holdings)}
              </div>
            </div>
          </div>

          {/* Moat Radar/Bar Visualization */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="glass-panel border border-darkBorder/60 rounded-2xl p-5 flex flex-col h-full">
              <div className="mb-4">
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Quant Moat Dimension</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <h4 className="text-base font-bold text-white">Moat Rating:</h4>
                  <span className="text-xl font-black text-emerald-400">{analysis.moat_rating} <span className="text-[10px] text-slate-500 font-normal">/10</span></span>
                </div>
              </div>

              {/* Moat Factors Chart */}
              <div className="flex-1 h-[250px] min-h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={moatChartData} layout="vertical" margin={{ left: -10, right: 10, top: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#141824" horizontal={false} />
                    <XAxis type="number" domain={[0, 10]} stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
                    <YAxis dataKey="name" type="category" stroke="#94A3B8" fontSize={9} width={95} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#090D16', borderColor: '#1E2433', borderRadius: '8px' }}
                      labelStyle={{ color: '#94A3B8', fontSize: '10px', fontWeight: 'bold' }}
                      formatter={(v) => [`${v}/10`, 'Score']}
                    />
                    <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={12}>
                      {moatChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="text-[9px] text-slate-500 mt-2 leading-relaxed border-t border-darkBorder/30 pt-3">
                * Moat scores represent aggregated competitive metrics where values above 7 indicate a wide-moat status with stable market positioning.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. FINANCIAL HEALTH TIMELINE */}
      {subTab === 'financials' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Key Metrics Timeline Cards */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="glass-panel border border-darkBorder/60 rounded-2xl p-4 flex flex-col justify-between h-24">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Financial Status</span>
                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                  analysis.financials_status === 'Strengthening' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                }`}>
                  {analysis.financials_status}
                </span>
              </div>
              <span className="text-xs text-slate-300 font-medium leading-relaxed mt-2.5">
                Key growth metrics are operating under optimal capacity margins.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'ROE (FY25)', val: `${analysis.financial_history[analysis.financial_history.length - 1].roe.toFixed(1)}%`, icon: Percent },
                { label: 'ROCE (FY25)', val: `${analysis.financial_history[analysis.financial_history.length - 1].roce.toFixed(1)}%`, icon: Award },
                { label: 'OP. MARGIN', val: `${analysis.financial_history[analysis.financial_history.length - 1].operating_margin.toFixed(1)}%`, icon: Wallet },
                { label: 'DEBT TO EQUITY', val: analysis.financial_history[analysis.financial_history.length - 1].debt_to_equity.toFixed(2), icon: Landmark }
              ].map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="bg-slate-950/70 border border-darkBorder/40 rounded-xl p-3 flex flex-col justify-between h-20">
                    <span className="text-[8px] text-slate-500 font-bold uppercase flex items-center gap-1">
                      <Icon className="w-3 h-3 text-slate-400" />
                      <span>{card.label}</span>
                    </span>
                    <span className="text-sm font-black mt-2 text-white">{card.val}</span>
                  </div>
                );
              })}
            </div>
            
            <div className="glass-panel border border-darkBorder/60 rounded-2xl p-4 text-[10px] text-slate-400 leading-relaxed text-justify">
              {analysis.financials_explanation}
            </div>
          </div>

          {/* Financials Timeline Chart */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            <div className="glass-panel border border-darkBorder/60 rounded-2xl p-5">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>5-Year Revenue & PAT growth timeline</span>
              </h3>
              
              <div className="w-full h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analysis.financial_history} margin={{ left: -15, right: 15, top: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#141824" vertical={false} />
                    <XAxis dataKey="year" stroke="#475569" fontSize={9} tickLine={false} />
                    <YAxis stroke="#475569" fontSize={9} tickLine={false} unit="%" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#090D16', borderColor: '#1E2433', borderRadius: '12px' }}
                      labelStyle={{ color: '#94A3B8', fontSize: '11px', fontWeight: 'bold' }}
                      formatter={(v, name) => [`${v}%`, name === 'revenue_growth' ? 'Revenue Growth' : 'PAT Growth']}
                    />
                    <Line type="monotone" dataKey="revenue_growth" stroke="#3B82F6" strokeWidth={2.5} name="revenue_growth" dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="pat_growth" stroke="#10B981" strokeWidth={2.5} name="pat_growth" dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="flex items-center justify-center gap-6 mt-2 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-blue-500"></div>
                  <span className="text-slate-400">Revenue Growth (%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-emerald-500"></div>
                  <span className="text-slate-400">PAT (Profit) Growth (%)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. STOCK VALUATION & PEERS */}
      {subTab === 'valuation' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* DCF Target Pricing Panel */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="glass-panel border border-darkBorder/60 rounded-2xl p-5 flex flex-col justify-between h-full relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-brandBlue/5 to-transparent pointer-events-none rounded-bl-full"></div>
              
              <div>
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">DCF Valuation Status</span>
                <div className="flex items-center justify-between mt-2 pb-2 border-b border-darkBorder/30">
                  <h4 className="text-base font-bold text-white">Fair Valuation:</h4>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    analysis.valuation_status === 'Undervalued' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}>
                    {analysis.valuation_status}
                  </span>
                </div>
              </div>

              <div className="my-5 flex flex-col gap-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">DCF Estimated Price</span>
                  <span className="text-2xl font-black text-white">{formatCurrency(analysis.valuation_metrics.dcf_estimate)}</span>
                </div>
                <div className="flex justify-between items-baseline border-b border-darkBorder/25 pb-3">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Current Price</span>
                  <span className="text-sm font-bold text-slate-400">{formatCurrency(analysis.valuation_metrics.current_price)}</span>
                </div>
                
                <div className="flex justify-between items-baseline">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Margin of Safety / Gap</span>
                  {(() => {
                    const margin = ((analysis.valuation_metrics.dcf_estimate - analysis.valuation_metrics.current_price) / analysis.valuation_metrics.current_price) * 100;
                    const isPositive = margin >= 0;
                    return (
                      <span className={`text-base font-black ${isPositive ? 'text-brandGreen' : 'text-brandRed'}`}>
                        {isPositive ? '+' : ''}{margin.toFixed(1)}%
                      </span>
                    );
                  })()}
                </div>
              </div>

              <p className="text-[10px] leading-relaxed text-slate-400 text-justify border-t border-darkBorder/25 pt-3">
                {analysis.valuation_explanation}
              </p>
            </div>
          </div>

          {/* Peer Comparison Chart */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="glass-panel border border-darkBorder/60 rounded-2xl p-5">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <Target className="w-4 h-4 text-emerald-400" />
                <span>Valuation multiples vs Indian/global competitors</span>
              </h3>

              <div className="w-full h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={peerValData} margin={{ left: -15, right: 15, top: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#141824" vertical={false} />
                    <XAxis dataKey="name" stroke="#475569" fontSize={9} tickLine={false} />
                    <YAxis stroke="#475569" fontSize={9} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#090D16', borderColor: '#1E2433', borderRadius: '10px' }}
                      labelStyle={{ color: '#94A3B8', fontSize: '10px', fontWeight: 'bold' }}
                      formatter={(v, name, props) => [`${v}x`, props.payload.type === 'PE' ? 'Price/Earnings' : 'EV/EBITDA']}
                    />
                    <Bar dataKey="value" barSize={25} radius={[4, 4, 0, 0]}>
                      {peerValData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#10B981' : '#475569'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="flex items-center justify-center gap-6 mt-3 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-emerald-500 rounded-sm"></div>
                  <span className="text-slate-400">Stock Multiples</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-slate-600 rounded-sm"></div>
                  <span className="text-slate-400">Sector / Competitor Average</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. RISKS & SCENARIOS */}
      {subTab === 'risks' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Ranked Risks list */}
          <div className="lg:col-span-6 flex flex-col gap-4">
            <div className="glass-panel border border-darkBorder/60 rounded-2xl p-5 flex flex-col h-full">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-darkBorder/30 pb-2 mb-3 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>Ranked Risk Matrix (Most to Least Dangerous)</span>
              </h3>

              <div className="flex-1 overflow-y-auto max-h-[340px] divide-y divide-darkBorder/35 flex flex-col">
                {analysis.risks.map((risk, index) => (
                  <div key={risk.name} className="py-3.5 first:pt-0 last:pb-0 flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-slate-950 border border-darkBorder flex items-center justify-center text-[10px] font-black text-slate-400 shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-bold text-white truncate">{risk.name}</h4>
                        <span className={`px-2 py-0.2 rounded text-[8px] font-black border ${getRiskBadgeColor(risk.level)}`}>
                          {risk.level}
                        </span>
                      </div>
                      <p className="text-[10px] leading-relaxed text-slate-400 mt-1.5">
                        {risk.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Scenario Simulation Forecast */}
          <div className="lg:col-span-6 flex flex-col gap-4">
            <div className="glass-panel border border-darkBorder/60 rounded-2xl p-5 flex flex-col h-full">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>12-24 Month Scenario Forecast Paths</span>
              </h3>

              <div className="w-full h-[250px] min-h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={scenariosChartData} margin={{ left: -15, right: 15, top: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#141824" vertical={false} />
                    <XAxis dataKey="name" stroke="#475569" fontSize={9} tickLine={false} />
                    <YAxis stroke="#475569" fontSize={9} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#090D16', borderColor: '#1E2433', borderRadius: '12px' }}
                      labelStyle={{ color: '#94A3B8', fontSize: '10px', fontWeight: 'bold' }}
                      formatter={(v) => [formatCurrency(Number(v)), 'Price']}
                    />
                    <Area type="monotone" dataKey="Bull" stroke="#10B981" fill="#10B981" fillOpacity={0.05} strokeWidth={2.5} name="Bull Case" />
                    <Area type="monotone" dataKey="Base" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.05} strokeWidth={2.5} name="Base Case" />
                    <Area type="monotone" dataKey="Bear" stroke="#EF4444" fill="#EF4444" fillOpacity={0.05} strokeWidth={2.5} name="Bear Case" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="flex items-center justify-center gap-5 mt-2.5 text-[9px] border-t border-darkBorder/35 pt-3">
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-0.5 bg-emerald-500"></div>
                  <span className="text-slate-500 font-bold uppercase">Bull Case (+24m: {formatCurrency(analysis.scenarios.bull_case_24m)})</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-0.5 bg-blue-500"></div>
                  <span className="text-slate-500 font-bold uppercase">Base Case (+24m: {formatCurrency(analysis.scenarios.base_case_24m)})</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-0.5 bg-red-500"></div>
                  <span className="text-slate-500 font-bold uppercase">Bear Case (+24m: {formatCurrency(analysis.scenarios.bear_case_24m)})</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
