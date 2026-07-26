import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';

interface Catalyst {
  Headline: string;
  Keyword: string;
  "Impacted Sector": string;
  Direction: string;
  Confidence: number;
  Sentiment: number;
  Source: string;
}

interface MasterAnalysisChartProps {
  data: any[];
  forecastData?: any[];
  catalysts: Catalyst[];
  symbol: string;
}

export const MasterAnalysisChart: React.FC<MasterAnalysisChartProps> = ({
  data,
  forecastData,
  catalysts,
  symbol,
}) => {
  // Split historical and forecast data
  let chartData: any[] = data.map(d => ({
    time: d.time,
    historical: d.close,
    type: 'historical',
  }));
  
  if (forecastData && forecastData.length > 0) {
    const formattedForecast = forecastData.map(pt => ({
      time: pt.time,
      forecast: pt.forecast,
      upper: pt.upper,
      lower: pt.lower,
      type: 'forecast',
    }));
    
    if (data.length > 0) {
      const lastHist = data[data.length - 1];
      formattedForecast.unshift({
        time: lastHist.time,
        forecast: lastHist.close,
        upper: lastHist.close,
        lower: lastHist.close,
        type: 'forecast',
      });
    }
    chartData = [...chartData, ...formattedForecast];
  }

  const isIndian = symbol.endsWith('.NS') || symbol.endsWith('.BO');
  const currencySymbol = isIndian ? '₹' : '$';

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat(isIndian ? 'en-IN' : 'en-US', { 
      style: 'currency', 
      currency: isIndian ? 'INR' : 'USD' 
    }).format(val);
  };

  const lastHistoricalPoint = data[data.length - 1];
  const nowTime = lastHistoricalPoint ? lastHistoricalPoint.time : '';

  return (
    <div className="w-full flex flex-col glass-panel rounded-2xl p-5 border border-darkBorder/60 shadow-lg">
      <div className="mb-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Master Quantitative Synthesis</h3>
        <h2 className="text-lg font-bold text-white mt-1 flex items-center gap-2">
          <span>🔮 Multi-Factor Prediction Overlay</span>
          <span className="px-2.5 py-0.5 text-[9px] bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded font-bold">
            {symbol} Model
          </span>
        </h2>
      </div>

      <div className="w-full h-[280px] md:h-[330px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.25}/>
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0}/>
              </linearGradient>
              <linearGradient id="colorMaster" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.25}/>
                <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#141824" vertical={false} />
            <XAxis 
              dataKey="time" 
              stroke="#475569" 
              fontSize={10}
              tickLine={false}
              axisLine={false}
              dy={10}
            />
            <YAxis 
              stroke="#475569" 
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${currencySymbol}${v}`}
              domain={['auto', 'auto']}
              dx={-10}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#090D16', borderColor: '#1E2433', borderRadius: '12px' }}
              labelStyle={{ color: '#94A3B8', fontSize: '11px', fontWeight: 'bold' }}
              formatter={(value: any, name: string) => {
                if (name === 'historical') return [formatCurrency(Number(value)), 'Historical Price'];
                if (name === 'forecast') return [formatCurrency(Number(value)), 'Forecast Price'];
                if (name === 'upper') return [formatCurrency(Number(value)), '95% CI Upper'];
                if (name === 'lower') return [formatCurrency(Number(value)), '95% CI Lower'];
                return [value, name];
              }}
            />
            
            {nowTime && (
              <ReferenceLine 
                x={nowTime} 
                stroke="#3B82F6" 
                strokeDasharray="3 3" 
                label={{ value: 'FORECAST', position: 'top', fill: '#3B82F6', fontSize: 9, fontWeight: 'bold' }} 
              />
            )}

            {/* Shaded confidence interval band (transparent range area) */}
            <Area
              type="monotone"
              dataKey={['lower', 'upper'] as any}
              stroke="none"
              fill="#8B5CF6"
              fillOpacity={0.08}
              connectNulls
            />

            {/* Historical Close Price Area */}
            <Area
              type="monotone"
              dataKey="historical"
              stroke="#3B82F6"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#colorClose)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 0 }}
              connectNulls
            />

            {/* Forecasted Price Area (Master Analysis purple theme) */}
            <Area
              type="monotone"
              dataKey="forecast"
              stroke="#8B5CF6"
              strokeWidth={2.5}
              strokeDasharray="4 4"
              fillOpacity={1}
              fill="url(#colorMaster)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 0 }}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {catalysts && catalysts.length > 0 && (
        <div className="mt-6 pt-5 border-t border-darkBorder/60">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Matching Macro News Catalysts</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {catalysts.slice(0, 4).map((cat, idx) => {
              const isPositive = cat.Direction.includes('Positive');
              return (
                <div key={idx} className="flex gap-3 bg-slate-950/60 border border-darkBorder/40 rounded-xl p-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm ${
                    isPositive ? 'bg-brandGreen/10 text-brandGreen' : 'bg-brandRed/10 text-brandRed'
                  }`}>
                    {isPositive ? '▲' : '▼'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white truncate">{cat.Headline}</div>
                    <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-2">
                      <span className="font-semibold text-slate-300 uppercase">{cat.Keyword}</span>
                      <span>•</span>
                      <span className="truncate">{cat["Impacted Sector"]}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
