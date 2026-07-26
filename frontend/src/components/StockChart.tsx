import React from 'react';
import { ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

interface ChartPoint {
  time: string;
  close?: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  [key: string]: any;
}

interface StockChartProps {
  data: ChartPoint[];
  forecastData?: any[];
  symbols: string[];
  range: string;
  onRangeChange: (r: string) => void;
  forecastHorizon: string;
  onForecastHorizonChange: (h: string) => void;
  showForecast: boolean;
  onShowForecastToggle: (show: boolean) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  modelProbabilities?: Record<string, number>;
  useTripleBarrier: boolean;
  onUseTripleBarrierToggle: (checked: boolean) => void;
}

export const StockChart: React.FC<StockChartProps> = ({
  data,
  forecastData,
  symbols,
  range,
  onRangeChange,
  forecastHorizon,
  onForecastHorizonChange,
  showForecast,
  onShowForecastToggle,
  selectedModel,
  onModelChange,
  modelProbabilities,
  useTripleBarrier,
  onUseTripleBarrierToggle,
}) => {
  const isComparison = symbols.length > 1;
  const primarySymbol = symbols[0] || 'Price';

  // Merge historical and forecast data
  let chartData: any[] = [];
  
  if (isComparison) {
    chartData = data.map(d => ({ ...d, type: 'historical' }));
  } else {
    // Single stock mode: split historical and forecast
    chartData = data.map(d => ({
      time: d.time,
      historical: d.close,
      type: 'historical',
    }));
    
    if (showForecast && forecastData && forecastData.length > 0) {
      const formattedForecast = forecastData.map(pt => ({
        time: pt.time,
        forecast: pt.forecast,
        upper: pt.upper,
        lower: pt.lower,
        type: 'forecast',
      }));
      
      // Connect the last historical point with the first forecast point
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
  }

  const isIndian = primarySymbol.endsWith('.NS') || primarySymbol.endsWith('.BO');
  const currencySymbol = isIndian ? '₹' : '$';

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat(isIndian ? 'en-IN' : 'en-US', { 
      style: 'currency', 
      currency: isIndian ? 'INR' : 'USD' 
    }).format(val);
  };

  const getModelColor = (model: string) => {
    const m = model.toLowerCase();
    if (m.includes('itransformer') || m.includes('transformer')) return '#8B5CF6'; // Purple
    if (m.includes('cnn') || m.includes('lstm')) return '#EC4899'; // Rose Pink
    if (m.includes('gbm') || m.includes('kalman')) return '#F59E0B'; // Amber Orange
    return '#10B981'; // Ensemble: Emerald Green
  };
  
  const modelColor = getModelColor(selectedModel);

  const ranges = ['1D', '5D', '1M', '6M', '1Y', '5Y', '10Y', 'MAX'];
  const forecastHorizons = ['1D', '5D', '1M', '6M', '1Y', '5Y'];
  const lineColors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

  return (
    <div className="w-full flex flex-col glass-panel rounded-2xl p-5 border border-darkBorder/60 shadow-lg">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>📈 Price Chart</span>
            <span className="text-xs font-normal text-slate-400">
              {isComparison ? `Comparing ${symbols.join(' vs ')}` : primarySymbol}
            </span>
          </h2>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 self-start xl:self-auto">
          {/* Past Analysis Controls */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Past Analysis:</span>
            <div className="flex items-center bg-slate-950 border border-darkBorder/60 rounded-xl p-1 text-[10px] flex-wrap sm:flex-nowrap">
              {ranges.map((r) => (
                <button
                  key={r}
                  onClick={() => onRangeChange(r)}
                  className={`px-2 py-1.5 rounded-lg font-bold transition-all ${
                    range.toUpperCase() === r.toUpperCase()
                      ? 'bg-brandBlue text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Future Prediction Option */}
          {!isComparison && (
            <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-darkBorder/60 pt-3 sm:pt-0 sm:pl-4">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={showForecast}
                  onChange={(e) => onShowForecastToggle(e.target.checked)}
                  className="rounded border-darkBorder/60 text-brandBlue focus:ring-0 bg-slate-950 w-3.5 h-3.5"
                />
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Future Prediction:</span>
              </label>
              
              {showForecast && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center bg-slate-950 border border-darkBorder/60 rounded-xl p-1 text-[10px]">
                    {forecastHorizons.map((h) => (
                      <button
                        key={h}
                        onClick={() => onForecastHorizonChange(h)}
                        className={`px-2 py-1.5 rounded-lg font-bold transition-all ${
                          forecastHorizon.toUpperCase() === h.toUpperCase()
                            ? 'bg-brandGreen text-white shadow-md'
                            : 'text-slate-400 hover:text-white hover:bg-slate-900'
                        }`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>

                  <select
                    value={selectedModel}
                    onChange={(e) => onModelChange(e.target.value)}
                    className="bg-slate-950 border border-darkBorder/60 rounded-xl px-2.5 py-1.5 text-[10px] font-bold text-slate-300 hover:text-white focus:outline-none focus:border-brandGreen transition-all cursor-pointer outline-none"
                  >
                    <option value="Ensemble">
                      Ensemble (Standard) {modelProbabilities?.['Ensemble'] ? `[${modelProbabilities['Ensemble']}%]` : ''}
                    </option>
                    <option value="iTransformer">
                      iTransformer (SOTA) {modelProbabilities?.['iTransformer'] ? `[${modelProbabilities['iTransformer']}%]` : ''}
                    </option>
                    <option value="CNN-LSTM/BiLSTM">
                      CNN-BiLSTM (Hybrid) {modelProbabilities?.['CNN-LSTM/BiLSTM'] ? `[${modelProbabilities['CNN-LSTM/BiLSTM']}%]` : ''}
                    </option>
                    <option value="GBM-KF">
                      GBM-KF (Stochastic) {modelProbabilities?.['GBM-KF'] ? `[${modelProbabilities['GBM-KF']}%]` : ''}
                    </option>
                  </select>

                  <label className="flex items-center gap-1.5 cursor-pointer select-none border-l border-darkBorder/40 pl-3 ml-1">
                    <input 
                      type="checkbox"
                      checked={useTripleBarrier}
                      onChange={(e) => onUseTripleBarrierToggle(e.target.checked)}
                      className="rounded border-darkBorder/60 text-brandGreen focus:ring-0 bg-slate-950 w-3.5 h-3.5"
                    />
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Triple-Barrier Mode</span>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="w-full h-[320px] md:h-[380px]">
        <ResponsiveContainer width="100%" height="100%">
          {isComparison ? (
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                formatter={(value: any, name: string) => [formatCurrency(Number(value)), name.replace('_close', '')]}
              />
              <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#94A3B8' }} />
              {symbols.map((sym, idx) => (
                <Line
                  key={sym}
                  type="monotone"
                  dataKey={`${sym}_close`}
                  name={sym}
                  stroke={lineColors[idx % lineColors.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              ))}
            </LineChart>
          ) : (
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0}/>
                </linearGradient>
                <linearGradient id={`colorForecast_${selectedModel}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={modelColor} stopOpacity={0.25}/>
                  <stop offset="95%" stopColor={modelColor} stopOpacity={0.0}/>
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
                  if (name === 'historical') return [formatCurrency(Number(value)), 'Close Price'];
                  if (name === 'forecast') return [formatCurrency(Number(value)), 'Forecast Price'];
                  if (name === 'upper') return [formatCurrency(Number(value)), '95% CI Upper'];
                  if (name === 'lower') return [formatCurrency(Number(value)), '95% CI Lower'];
                  return [value, name];
                }}
              />
              {/* Shaded confidence interval band (transparent range area) */}
              <Area
                type="monotone"
                dataKey={['lower', 'upper'] as any}
                stroke="none"
                fill={modelColor}
                fillOpacity={0.08}
                connectNulls
              />
              {/* Historical area line */}
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
              {/* Forecast area line (styled with selected model theme color) */}
              <Area
                type="monotone"
                dataKey="forecast"
                stroke={modelColor}
                strokeWidth={2.5}
                strokeDasharray="4 4"
                fillOpacity={1}
                fill={`url(#colorForecast_${selectedModel})`}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0 }}
                connectNulls
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
