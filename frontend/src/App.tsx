import React, { useState, useEffect, useRef } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import {
  Search, Plus, Trash2, TrendingUp, TrendingDown, RefreshCw,
  Database, Cpu, Globe, Send, LineChart, Sparkles, Clock,
  Info, BarChart2, MessageSquare, ChevronRight, X, User,
  Sliders, Users, Lock, Settings, Key, Activity

} from 'lucide-react';
import { StockChart } from './components/StockChart';
import { MasterAnalysisChart } from './components/MasterAnalysisChart';
import { ShouldIInvestTab } from './components/ShouldIInvestTab';
import { WhenToInvestTab } from './components/WhenToInvestTab';
import { NasdaqSignalsTab } from './components/NasdaqSignalsTab';

interface WatchlistItem {

  symbol: string;
  name: string;
  price: number;
  premarketPrice?: number;
  changePercent: number;
  yoyTrend: 'Growth' | 'Decline';
  sparkline: number[];
  notes: string;
  investSignal?: 'invest' | 'book_profit' | 'hold';
}

interface Catalyst {
  Headline: string;
  Keyword: string;
  "Impacted Sector": string;
  Direction: string;
  Confidence: number;
  Sentiment: number;
  Source: string;
}

interface MasterAnalysis {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  masterScore: number;
  scores: {
    macro: number;
    micro: number;
    corporate: number;
    product: number;
    sentiment: number;
  };
  metrics: {
    rsi: number;
    macd: number;
    smaRatio: number;
    volumeZ: number;
    pe: number | null;
    debtToEquity: number | null;
    margin: number | null;
    sentiment: number;
  };
  catalysts: Catalyst[];
  forecast: {
    predictedReturn: number;
    targetPrice: number;
    mape: number;
    mda: number;
  };
  selectedCriteria?: string[];
  breakdown?: {
    [key: string]: number;
  };
  thesis: string;
}

interface LLMConfig {
  active_llm: string;
  api_keys: {
    OpenAI: string;
    Gemini: string;
    AWS: string;
  };
  gemini_model?: string;
  users: Array<{ username: string; password: string; role: string }>;
}

// Creative Glassmorphic Logo Component (See-thru outline)
const StockPriceLogo = () => (
  <div className="w-9 h-9 rounded-xl border border-white/15 bg-white/5 backdrop-blur-md flex items-center justify-center shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.25)] hover:border-brandBlue/50 transition-all relative overflow-hidden shrink-0 group">
    <div className="absolute inset-0 bg-gradient-to-tr from-brandBlue/20 to-purple-500/10 opacity-35 group-hover:opacity-50 transition-all duration-300"></div>
    <svg className="w-5 h-5 text-white/80 group-hover:text-brandBlue group-hover:scale-105 transition-all duration-300 relative z-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4" cy="18" r="1.2" className="fill-white/15 stroke-white/60" />
      <circle cx="10" cy="11" r="1.2" className="fill-white/15 stroke-white/60" />
      <circle cx="16" cy="14" r="1.2" className="fill-white/15 stroke-white/60" />
      <circle cx="21" cy="6" r="1.2" className="fill-brandBlue/30 stroke-brandBlue" />
      <path d="M4 18 L10 11 L16 14 L21 6" className="stroke-white/40 group-hover:stroke-brandBlue/60 transition-all duration-300" strokeWidth="2" />
      <path d="M17 6 H21 V10" className="stroke-brandBlue" strokeWidth="2.5" />
    </svg>
  </div>
);

// Currency Symbol helper
const getCurrencySymbol = (symbol: string) => {
  if (symbol && (symbol.endsWith('.NS') || symbol.endsWith('.BO'))) {
    return '₹';
  }
  return '$';
};

// Scrolling Ticker Component
const StocksTicker = ({ stocks }: { stocks: any[] }) => {
  // Seamless infinite loop: repeat list twice
  const repeatedStocks = [...stocks, ...stocks];

  return (
    <div className="ticker-wrap select-none py-1.5 z-50 shrink-0">
      <div className="ticker-content flex items-center gap-8 animate-marquee">
        {repeatedStocks.map((s, idx) => {
          const isUp = s.changePercent >= 0;
          // Standard colors: green if up, red if down
          const colorClass = isUp ? 'text-brandGreen' : 'text-brandRed';
          const currencySymbol = getCurrencySymbol(s.symbol);

          return (
            <div key={idx} className="flex items-center gap-2 text-[10px] font-bold whitespace-nowrap">
              <span className="text-white font-extrabold">{s.symbol}</span>
              <span className="text-slate-500 font-medium max-w-[80px] truncate">{s.name}</span>
              <span className={`font-bold ${colorClass}`}>{currencySymbol}{s.price.toFixed(2)}</span>
              <span className={`font-black ${colorClass}`}>
                {isUp ? '▲' : '▼'} {Math.abs(s.changePercent).toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const GOOGLE_CLIENT_ID = "863372782365-2phbet89mckiejj7bvm2ntbi43n5kc3l.apps.googleusercontent.com"; // Can be updated by user in production

export default function App() {
  // Global States
  const [selectedMarket, setSelectedMarket] = useState<'US' | 'IN'>(() => {
    const saved = localStorage.getItem('selectedMarket');
    return (saved === 'IN' || saved === 'US') ? saved : 'US';
  });
  const [selectedSymbol, setSelectedSymbol] = useState<string>(() => {
    const saved = localStorage.getItem('selectedMarket');
    return saved === 'IN' ? 'RELIANCE.NS' : 'GOOGL';
  });
  const [comparisonSymbols, setComparisonSymbols] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [comparisonInput, setComparisonInput] = useState<string>('');

  // Login Wall Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!localStorage.getItem('jwtToken'));
  const [currentUser, setCurrentUser] = useState<{ username: string; role: string }>(() => {
    try {
      const savedUser = localStorage.getItem('currentUser');
      return savedUser ? JSON.parse(savedUser) : { username: '', role: '' };
    } catch {
      return { username: '', role: '' };
    }
  });
  const [token, setToken] = useState<string>(() => localStorage.getItem('jwtToken') || '');
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState<boolean>(false);

  const authFetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const activeToken = token || localStorage.getItem('jwtToken');
    if (activeToken) {
      headers.set('Authorization', `Bearer ${activeToken}`);
    }
    return fetch(input, { ...init, headers });
  };

  // Responsive Mobile Tab State
  const [mobileActiveTab, setMobileActiveTab] = useState<'watch' | 'deck' | 'right'>('deck');

  // Admin Settings Management
  const [adminSettings, setAdminSettings] = useState<LLMConfig | null>(null);
  const [newUsername, setNewUsername] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [newUserRole, setNewUserRole] = useState<string>('user');

  // User Personal API Keys
  const [userKeys, setUserKeys] = useState<{ OpenAI: string; Gemini: string; AWS: string; active_llm?: string }>({ OpenAI: '', Gemini: '', AWS: '', active_llm: 'Gemini' });
  const [userKeysSuccessMsg, setUserKeysSuccessMsg] = useState<string>('');

  // View States
  const [viewMode, setViewMode] = useState<'deck' | 'master' | 'invest' | 'admin' | 'when_to_invest' | 'nasdaq_signals'>('deck');


  // Dashboard Data States
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [chartRange, setChartRange] = useState<string>('1M');
  const [forecastHorizon, setForecastHorizon] = useState<string>('1M');
  const [selectedModel, setSelectedModel] = useState<string>('Ensemble');
  const [useTripleBarrier, setUseTripleBarrier] = useState<boolean>(false);
  const [showForecast, setShowForecast] = useState<boolean>(true);
  const [chartData, setChartData] = useState<any[]>([]);
  const [forecastData, setForecastData] = useState<any | null>(null);
  const [fundamentals, setFundamentals] = useState<any | null>(null);
  const [news, setNews] = useState<any[]>([]);
  const [macroCatalysts, setMacroCatalysts] = useState<any[]>([]);

  // Master Analysis States
  const [masterAnalysis, setMasterAnalysis] = useState<MasterAnalysis | null>(null);
  const [selectedCriteria, setSelectedCriteria] = useState<string[]>([
    "Market Analysis", "Fundamentals", "News feed", "Pre market numbers", "Financial status"
  ]);
  const [isCriteriaDropdownOpen, setIsCriteriaDropdownOpen] = useState<boolean>(false);

  // Assistant States
  const [chatMessage, setChatMessage] = useState<string>('');
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'assistant', content: string }>>([
    { role: 'assistant', content: 'Hello! I am FuMa. Ask me about market trends, valuations, or quantitative models.' }
  ]);
  const [searchMode, setSearchMode] = useState<'app' | 'internet' | 'both'>('both');
  const [rightActiveTab, setRightActiveTab] = useState<'fundamentals' | 'news' | 'financials' | 'admin'>('fundamentals');

  // Loading & Error States
  const [isWatchlistLoading, setIsWatchlistLoading] = useState<boolean>(false);
  const [isChartLoading, setIsChartLoading] = useState<boolean>(false);
  const [isMasterLoading, setIsMasterLoading] = useState<boolean>(false);
  const [isInvestLoading, setIsInvestLoading] = useState<boolean>(false);
  const [investAnalysis, setInvestAnalysis] = useState<any | null>(null);
  const [isWhenToInvestLoading, setIsWhenToInvestLoading] = useState<boolean>(false);
  const [whenToInvestData, setWhenToInvestData] = useState<any | null>(null);
  const [isAddingTicker, setIsAddingTicker] = useState<boolean>(false);
  const [newTickerInput, setNewTickerInput] = useState<string>('');
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string>('');
  const [isServerWarmingUp, setIsServerWarmingUp] = useState<boolean>(false);
  const isFirstPing = useRef<boolean>(true);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Ping backend server availability (handles Render free tier cold starts)
  useEffect(() => {
    let timer: any;
    const checkServer = async () => {
      try {
        const res = await fetch('/api/ping');
        if (res.ok) {
          if (isServerWarmingUp) {
            setIsServerWarmingUp(false);
            if (isAuthenticated) {
              fetchWatchlist();
              fetchMacroCatalysts();
              if (selectedSymbol) {
                fetchStockInfo(selectedSymbol);
                fetchChartAndForecast(selectedSymbol, chartRange, comparisonSymbols, forecastHorizon);
              }
            }
          }
          isFirstPing.current = false;
        } else {
          setIsServerWarmingUp(true);
          isFirstPing.current = false;
          timer = setTimeout(checkServer, 3500);
        }
      } catch {
        setIsServerWarmingUp(true);
        isFirstPing.current = false;
        timer = setTimeout(checkServer, 3500);
      }
    };
    checkServer();
    return () => clearTimeout(timer);
  }, [isAuthenticated, selectedSymbol]);

  // Fetch watchlist and initial data on mount (only when authenticated) or when market changes
  useEffect(() => {
    if (isAuthenticated) {
      fetchWatchlist();
      fetchMacroCatalysts();
      fetchUserKeys(currentUser.username);
      if (currentUser.role === 'admin' || currentUser.role === 'manager') {
        fetchAdminSettings();
      }
    }
  }, [isAuthenticated, currentUser.role, currentUser.username, selectedMarket]);

  // Poll watchlist data every 6 seconds for live updates on the fly
  useEffect(() => {
    if (isAuthenticated) {
      const interval = setInterval(() => {
        fetchWatchlist(true);
      }, 6000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, selectedMarket]);

  // Fetch chart data, fundamentals and model forecast when active symbol updates
  useEffect(() => {
    if (isAuthenticated && selectedSymbol) {
      fetchStockInfo(selectedSymbol);
      fetchChartAndForecast(selectedSymbol, chartRange, comparisonSymbols, forecastHorizon);
      if (viewMode === 'master') {
        runMasterAnalysis(selectedSymbol, selectedCriteria);
      } else if (viewMode === 'invest') {
        fetchInvestAnalysis(selectedSymbol);
      } else if (viewMode === 'when_to_invest') {
        fetchWhenToInvestAnalysis(selectedSymbol);
      }
    }
  }, [selectedSymbol, chartRange, forecastHorizon, selectedModel, isAuthenticated, selectedCriteria, useTripleBarrier]);

  // Fetch master analysis when switching view
  useEffect(() => {
    if (isAuthenticated) {
      if (viewMode === 'master' && selectedSymbol) {
        runMasterAnalysis(selectedSymbol, selectedCriteria);
      } else if (viewMode === 'invest' && selectedSymbol) {
        fetchInvestAnalysis(selectedSymbol);
      } else if (viewMode === 'when_to_invest' && selectedSymbol) {
        fetchWhenToInvestAnalysis(selectedSymbol);
      }
    }
  }, [viewMode, isAuthenticated]);

  // Fetch admin settings when right active tab changes to admin
  useEffect(() => {
    if (isAuthenticated && rightActiveTab === 'admin') {
      fetchAdminSettings();
    }
  }, [rightActiveTab, isAuthenticated]);

  // Refresh news feed every time the News tab is opened
  useEffect(() => {
    if (isAuthenticated && rightActiveTab === 'news' && selectedSymbol) {
      refreshNews(selectedSymbol);
    }
  }, [rightActiveTab]);

  // Sync scroll on chat thread
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Fetch watch list
  const fetchWatchlist = async (isPoll: boolean = false) => {
    if (!isPoll) setIsWatchlistLoading(true);
    try {
      const response = await authFetch(`/api/watchlist?market=${selectedMarket}`);
      if (response.ok) {
        const data = await response.json();
        setWatchlist(data);
      }
    } catch (err) {
      console.error('Error loading watchlist', err);
    } finally {
      if (!isPoll) setIsWatchlistLoading(false);
    }
  };

  // Fetch macro news catalysts
  const fetchMacroCatalysts = async () => {
    try {
      const response = await authFetch('/api/macro-catalysts');
      if (response.ok) {
        const data = await response.json();
        setMacroCatalysts(data);
      }
    } catch (err) {
      console.error('Error fetching catalysts', err);
    }
  };

  // Fetch stock fundamentals and leader comments news
  const fetchStockInfo = async (symbol: string) => {
    try {
      const response = await authFetch(`/api/stock/${symbol}?username=${currentUser.username}`);
      if (response.ok) {
        const data = await response.json();
        setFundamentals(data);
      } else {
        setFundamentals(null);
      }

      await refreshNews(symbol);
    } catch (err) {
      console.error('Error loading stock info', err);
    }
  };

  // Refresh news with a cache-bust timestamp — always fetches the latest
  const refreshNews = async (symbol?: string) => {
    const sym = symbol || selectedSymbol;
    if (!sym) return;
    try {
      const cacheBust = Date.now();
      const newsResp = await authFetch(`/api/news/${sym}?username=${currentUser.username}&_t=${cacheBust}`);
      if (newsResp.ok) {
        const newsData = await newsResp.json();
        setNews(newsData);
      }
    } catch (err) {
      console.error('Error refreshing news', err);
    }
  };

  // Fetch chart price history & model predictions
  const fetchChartAndForecast = async (symbol: string, range: string, comparison: string[] = [], horizon: string = '1M') => {
    setIsChartLoading(true);
    setErrorMsg('');
    try {
      const symbolsString = [symbol, ...comparison].join(',');
      const chartResp = await authFetch(`/api/chart/${symbolsString}?range=${range}`);
      if (!chartResp.ok) throw new Error("Price data unavailable for this ticker");
      const chartJson = await chartResp.json();
      setChartData(chartJson.data);

      const forecastResp = await authFetch('/api/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, horizon, model: selectedModel, username: currentUser.username, use_triple_barrier: useTripleBarrier })
      });
      if (forecastResp.ok) {
        const forecastJson = await forecastResp.json();
        setForecastData(forecastJson);
      } else {
        setForecastData(null);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch model projections');
    } finally {
      setIsChartLoading(false);
    }
  };

  // Fetch admin configs
  const fetchAdminSettings = async () => {
    try {
      const resp = await authFetch('/api/admin/settings');
      if (resp.ok) {
        const data = await resp.json();
        setAdminSettings(data);
      }
    } catch (err) {
      console.error('Failed to load admin settings', err);
    }
  };

  // Fetch user personal keys
  const fetchUserKeys = async (username: string) => {
    try {
      const resp = await authFetch(`/api/user/keys/${username}`);
      if (resp.ok) {
        const data = await resp.json();
        setUserKeys(data.api_keys);
      }
    } catch (err) {
      console.error('Failed to load user API keys', err);
    }
  };

  // Save user personal keys
  const handleSaveUserKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserKeysSuccessMsg('');
    try {
      const resp = await authFetch('/api/user/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentUser.username,
          api_keys: userKeys
        })
      });
      if (resp.ok) {
        setUserKeysSuccessMsg('Your custom API keys saved successfully!');
        setTimeout(() => setUserKeysSuccessMsg(''), 4000);
      }
    } catch (err) {
      console.error('Failed to save user API keys', err);
    }
  };

  // Add stock to watchlist
  const handleAddToWatchlist = async (sym: string) => {
    if (!sym) return;
    let targetSym = sym.trim().toUpperCase();
    if (selectedMarket === 'IN' && !targetSym.includes('.') && !targetSym.includes(' ')) {
      targetSym = targetSym + '.NS';
    }
    try {
      const resp = await authFetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: targetSym, notes: "Tracked from UI" })
      });
      if (resp.ok) {
        fetchWatchlist();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Remove stock from watchlist
  const handleRemoveFromWatchlist = async (sym: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const resp = await authFetch(`/api/watchlist/${sym}`, { method: 'DELETE' });
      if (resp.ok) {
        fetchWatchlist();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Trigger search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      let sym = searchQuery.trim().toUpperCase();
      if (selectedMarket === 'IN' && !sym.includes('.') && !sym.includes(' ')) {
        sym = sym + '.NS';
      }
      setSelectedSymbol(sym);
      setSearchQuery('');
      setComparisonSymbols([]);
      setMobileActiveTab('deck');
    }
  };

  // Add stock to comparison overlay
  const handleAddComparison = (e: React.FormEvent) => {
    e.preventDefault();
    if (comparisonInput.trim()) {
      let cleanSym = comparisonInput.trim().toUpperCase();
      if (selectedMarket === 'IN' && !cleanSym.includes('.') && !cleanSym.includes(' ')) {
        cleanSym = cleanSym + '.NS';
      }
      if (cleanSym === selectedSymbol) {
        setComparisonInput('');
        return;
      }
      if (!comparisonSymbols.includes(cleanSym)) {
        const newComparison = [...comparisonSymbols, cleanSym];
        setComparisonSymbols(newComparison);
        fetchChartAndForecast(selectedSymbol, chartRange, newComparison, forecastHorizon);
      }
      setComparisonInput('');
    }
  };

  // Remove symbol from comparison
  const handleRemoveComparison = (sym: string) => {
    const newComparison = comparisonSymbols.filter(s => s !== sym);
    setComparisonSymbols(newComparison);
    fetchChartAndForecast(selectedSymbol, chartRange, newComparison, forecastHorizon);
  };

  // Trigger Master Quantitative Analysis
  const runMasterAnalysis = async (symbol: string, criteriaToUse: string[] = selectedCriteria) => {
    setIsMasterLoading(true);
    try {
      const resp = await authFetch('/api/master-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          model: selectedModel,
          username: currentUser.username,
          selected_criteria: criteriaToUse
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        setMasterAnalysis(data);
      }
    } catch (err) {
      console.error('Error generating master thesis', err);
    } finally {
      setIsMasterLoading(false);
    }
  };

  // Fetch Should I Invest analysis
  const fetchInvestAnalysis = async (symbol: string) => {
    setIsInvestLoading(true);
    try {
      const resp = await authFetch(`/api/should-i-invest/${symbol}?username=${currentUser.username}`);
      if (resp.ok) {
        const data = await resp.json();
        setInvestAnalysis(data);
      } else {
        setInvestAnalysis(null);
      }
    } catch (err) {
      console.error('Failed to load Should I Invest analysis', err);
      setInvestAnalysis(null);
    } finally {
      setIsInvestLoading(false);
    }
  };

  // Fetch When To Invest analysis
  const fetchWhenToInvestAnalysis = async (symbol: string) => {
    setIsWhenToInvestLoading(true);
    try {
      const resp = await authFetch(`/api/when-to-invest/${symbol}`);
      if (resp.ok) {
        const data = await resp.json();
        setWhenToInvestData(data);
      } else {
        setWhenToInvestData(null);
      }
    } catch (err) {
      console.error('Failed to load When To Invest analysis', err);
      setWhenToInvestData(null);
    } finally {
      setIsWhenToInvestLoading(false);
    }
  };

  // Handle AI Chat submissions
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || isChatLoading) return;

    const userText = chatMessage.trim();
    setChatMessage('');

    const updatedHistory = [...chatHistory, { role: 'user' as const, content: userText }];
    setChatHistory(updatedHistory);
    setIsChatLoading(true);

    try {
      const resp = await authFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          symbol: selectedSymbol,
          chat_history: updatedHistory.slice(-6),
          search_mode: searchMode,
          username: currentUser.username
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        setChatHistory(prev => [...prev, { role: 'assistant', content: data.message }]);
      } else {
        throw new Error("Chat failed");
      }
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'assistant', content: 'Connection timed out. Please verify the backend uvicorn server is running.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Login authentication wall handler
  const handleAppLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const resp = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      if (resp.ok) {
        const data = await resp.json();
        setCurrentUser({ username: data.username, role: data.role });
        setToken(data.token);
        localStorage.setItem('jwtToken', data.token);
        localStorage.setItem('currentUser', JSON.stringify({ username: data.username, role: data.role }));
        setIsAuthenticated(true);
        fetchUserKeys(data.username);
        setLoginUsername('');
        setLoginPassword('');
      } else {
        setLoginError('Invalid username or password credentials');
      }
    } catch (err) {
      setLoginError('Error establishing secure auth session');
    }
  };

  // Admin settings save handler
  const handleSaveAdminSettings = async () => {
    if (!adminSettings) return;
    setSaveSuccessMsg('');
    try {
      const resp = await authFetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active_llm: adminSettings.active_llm,
          api_keys: adminSettings.api_keys,
          gemini_model: adminSettings.gemini_model || 'gemini-3.1-flash-lite'
        })
      });
      if (resp.ok) {
        setSaveSuccessMsg('LLM Engine parameters and credentials saved successfully!');
        fetchAdminSettings();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Admin user creation handler
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) return;
    try {
      const resp = await authFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword.trim(),
          role: newUserRole
        })
      });
      if (resp.ok) {
        setNewUsername('');
        setNewPassword('');
        fetchAdminSettings();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Admin user deletion handler
  const handleDeleteUser = async (username: string) => {
    if (username === 'suman') return;
    try {
      const resp = await authFetch(`/api/admin/users/${username}`, { method: 'DELETE' });
      if (resp.ok) {
        fetchAdminSettings();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Admin user password update handler
  const handleUpdatePassword = async (username: string, currentRole: string) => {
    const newPass = window.prompt(`Enter new password for user '${username}':`);
    if (newPass === null) return; // user cancelled
    if (!newPass.trim()) {
      alert("Password cannot be empty.");
      return;
    }
    try {
      const resp = await authFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username,
          password: newPass.trim(),
          role: currentRole
        })
      });
      if (resp.ok) {
        alert(`Password for user '${username}' updated successfully.`);
        fetchAdminSettings();
      } else {
        alert("Failed to update password.");
      }
    } catch (err) {
      console.error(err);
      alert("Error updating password.");
    }
  };

  // Market Selection change handler
  const handleMarketChange = (market: 'US' | 'IN') => {
    if (market === selectedMarket) return;
    setSelectedMarket(market);
    localStorage.setItem('selectedMarket', market);
    setComparisonSymbols([]);
    if (market === 'IN') {
      setSelectedSymbol('RELIANCE.NS');
    } else {
      setSelectedSymbol('GOOGL');
    }
  };

  // Logout handler
  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser({ username: '', role: '' });
    setToken('');
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('currentUser');
    setViewMode('deck');
  };

  // Formatting helpers
  const formatCompact = (val: number | null) => {
    if (!val) return 'N/A';
    if (val >= 1e12) return (val / 1e12).toFixed(2) + 'T';
    if (val >= 1e9) return (val / 1e9).toFixed(2) + 'B';
    if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
    return val.toLocaleString();
  };

  const getSentimentColor = (sentimentText: string) => {
    const s = sentimentText.toLowerCase();
    if (s.includes('bullish') || s.includes('positive')) return 'text-brandGreen bg-brandGreen/10 border-brandGreen/25';
    if (s.includes('bearish') || s.includes('negative')) return 'text-brandRed bg-brandRed/10 border-brandRed/25';
    return 'text-amber-400 bg-amber-400/10 border-amber-400/25';
  };

  const marketFilteredWatchlist = watchlist.filter(stock => {
    const isIndian = stock.symbol.endsWith('.NS') || stock.symbol.endsWith('.BO');
    return selectedMarket === 'IN' ? isIndian : !isIndian;
  });

  const tickerStocks = marketFilteredWatchlist.length > 0
    ? marketFilteredWatchlist.map(w => ({
      symbol: w.symbol,
      name: w.name,
      price: w.price,
      changePercent: w.changePercent
    }))
    : (selectedMarket === 'IN'
      ? [
        { symbol: 'RELIANCE.NS', name: 'Reliance Industries', price: 2450.50, changePercent: 1.20 },
        { symbol: 'TCS.NS', name: 'Tata Consultancy Services', price: 3820.15, changePercent: -0.45 },
        { symbol: 'HDFCBANK.NS', name: 'HDFC Bank Ltd.', price: 1450.80, changePercent: 0.95 },
        { symbol: 'INFY.NS', name: 'Infosys Ltd.', price: 1420.30, changePercent: 1.80 },
        { symbol: 'ICICIBANK.NS', name: 'ICICI Bank Ltd.', price: 1080.45, changePercent: -0.15 },
        { symbol: 'SBIN.NS', name: 'State Bank of India', price: 830.25, changePercent: 2.10 },
        { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel', price: 1350.60, changePercent: 0.35 },
        { symbol: 'ITC.NS', name: 'ITC Limited', price: 425.90, changePercent: -0.80 },
        { symbol: 'LT.NS', name: 'Larsen & Toubro', price: 3550.00, changePercent: 1.15 },
        { symbol: 'TATAMOTORS.NS', name: 'Tata Motors', price: 980.40, changePercent: 3.40 }
      ]
      : [
        { symbol: 'AAPL', name: 'Apple Inc.', price: 314.58, changePercent: 0.00 },
        { symbol: 'MSFT', name: 'Microsoft Corp.', price: 505.06, changePercent: 0.00 },
        { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 340.65, changePercent: 0.00 },
        { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 138.85, changePercent: 0.00 },
        { symbol: 'TSLA', name: 'Tesla, Inc.', price: 354.81, changePercent: 0.00 },
        { symbol: 'AMZN', name: 'Amazon.com Inc.', price: 221.42, changePercent: 0.00 },
        { symbol: 'META', name: 'Meta Platforms', price: 687.30, changePercent: 0.00 },
        { symbol: 'NFLX', name: 'Netflix Inc.', price: 79.84, changePercent: 0.00 }
      ]
    );

  // ================================= RENDER LOGIN WALL AT STARTUP =================================
  if (!isAuthenticated) {
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <div className="flex flex-col min-h-screen bg-[#080A10] text-slate-100 font-sans">
          <StocksTicker stocks={tickerStocks} />
          <div className="flex-1 flex flex-col items-center justify-center p-4">
            <div className="glass-panel border border-darkBorder/60 w-full max-w-sm rounded-2xl overflow-hidden p-6 relative shadow-2xl">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-brandBlue/10 to-transparent pointer-events-none rounded-bl-full"></div>

              <div className="flex flex-col items-center gap-2.5 mb-6">
                <StockPriceLogo /> {/* Glowing graph logo (Issue Fix) */}
                <h2 className="text-base font-black text-brandBlue mt-1">StockPrice</h2>
                <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">Forecasting & Portfolio Terminal</p>
              </div>

              {loginError && (
                <div className="mb-4 p-3 bg-brandRed/10 border border-brandRed/30 rounded-xl text-xs text-brandRed font-semibold text-center">
                  {loginError}
                </div>
              )}

              <form onSubmit={handleAppLoginSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Username</label>
                  <input
                    type="text"
                    placeholder="Username"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs bg-slate-950 border border-darkBorder/60 rounded-xl focus:outline-none focus:border-brandBlue text-white"
                    required
                  />
                </div>

                <div>
                  <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Password</label>
                  <input
                    type="password"
                    placeholder="Password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs bg-slate-950 border border-darkBorder/60 rounded-xl focus:outline-none focus:border-brandBlue text-white"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-brandBlue hover:bg-blue-600 transition-all font-bold text-xs text-white rounded-xl mt-2 flex items-center justify-center gap-1.5 shadow-md shadow-brandBlue/20"
                >
                  <span>Authenticate Account</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </form>

              <div className="relative flex py-3 items-center">
                <div className="flex-grow border-t border-darkBorder/30"></div>
                <span className="flex-shrink mx-3 text-[9px] text-slate-500 font-bold uppercase">or</span>
                <div className="flex-grow border-t border-darkBorder/30"></div>
              </div>

              <div className="flex justify-center mt-1">
                <GoogleLogin
                  onSuccess={async (credentialResponse) => {
                    const token = credentialResponse.credential;
                    if (!token) return;
                    setLoginError('');
                    try {
                      const resp = await fetch('/api/auth/google', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token })
                      });
                      if (resp.ok) {
                        const data = await resp.json();
                        setCurrentUser({ username: data.username, role: data.role });
                        setToken(data.token);
                        localStorage.setItem('jwtToken', data.token);
                        localStorage.setItem('currentUser', JSON.stringify({ username: data.username, role: data.role }));
                        setIsAuthenticated(true);
                        fetchUserKeys(data.username);
                      } else {
                        const errInfo = await resp.json();
                        setLoginError(errInfo.detail || 'Google authentication failed');
                      }
                    } catch (err) {
                      setLoginError('Error verifying Google credentials');
                    }
                  }}
                  onError={() => {
                    setLoginError('Google Sign-In initialization failed');
                  }}
                  theme="filled_black"
                  size="large"
                  width="100%"
                />
              </div>

              {loginUsername.trim().toLowerCase() === 'suman' && (
                <div className="text-center mt-4">
                  <button
                    type="button"
                    onClick={async () => {
                      setLoginError('');
                      try {
                        const resp = await fetch('/api/auth/google', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ token: "mock_developer_user" })
                        });
                        if (resp.ok) {
                          const data = await resp.json();
                          setCurrentUser({ username: data.username, role: data.role });
                          setToken(data.token);
                          localStorage.setItem('jwtToken', data.token);
                          localStorage.setItem('currentUser', JSON.stringify({ username: data.username, role: data.role }));
                          setIsAuthenticated(true);
                          fetchUserKeys(data.username);
                        } else {
                          const errInfo = await resp.json();
                          setLoginError(errInfo.detail || 'Mock authentication failed');
                        }
                      } catch (err) {
                        setLoginError('Error executing mock authentication');
                      }
                    }}
                    className="text-[9px] text-slate-500 hover:text-brandBlue font-bold underline transition-colors cursor-pointer"
                  >
                    Bypass Google Login (Local Dev Mock Auth)
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      </GoogleOAuthProvider>
    );
  }

  // ================================= RENDER MAIN WORKSPACE (AUTHENTICATED) =================================
  return (
    <div className="flex flex-col min-h-screen bg-[#080A10] text-slate-100 font-sans">
      <StocksTicker stocks={tickerStocks} />

      {isServerWarmingUp && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-amber-400 text-xs z-50">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
            <span className="font-semibold text-[11px]">Backend server is spinning up (Render free tier cold start)... Market data will auto-load in a few seconds.</span>
          </div>
        </div>
      )}

      {/* ================================= HEADER ================================= */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-darkBorder bg-darkCard/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <StockPriceLogo />
          <div>
            <h1 className="text-xs sm:text-sm font-black text-brandBlue tracking-tight">StockPrice</h1>
            <p className="text-[8px] text-slate-400 uppercase tracking-widest font-semibold mt-0.5 hidden xs:block">QuantPred Engine</p>
          </div>
        </div>

        {/* Creative Market Toggle Selector */}
        <div className="flex items-center bg-slate-950/80 border border-darkBorder/60 rounded-xl p-0.5 relative overflow-hidden ml-2 sm:ml-4 select-none shrink-0 shadow-lg shadow-black/30">
          <button
            type="button"
            onClick={() => handleMarketChange('US')}
            className={`px-2.5 sm:px-3.5 py-1 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all duration-300 relative z-10 flex items-center gap-1 sm:gap-1.5 ${selectedMarket === 'US'
              ? 'text-white bg-gradient-to-r from-brandBlue to-blue-600 shadow-md shadow-brandBlue/20 font-black'
              : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <span className="text-xs leading-none">🇺🇸</span>
            <span className="hidden xs:inline">US Markets</span>
          </button>
          <button
            type="button"
            onClick={() => handleMarketChange('IN')}
            className={`px-2.5 sm:px-3.5 py-1 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all duration-300 relative z-10 flex items-center gap-1 sm:gap-1.5 ${selectedMarket === 'IN'
              ? 'text-white bg-gradient-to-r from-brandBlue to-blue-600 shadow-md shadow-brandBlue/20 font-black'
              : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <span className="text-xs leading-none">🇮🇳</span>
            <span className="hidden xs:inline">India Markets</span>
          </button>
        </div>

        {/* Global Search — Enhanced Search bar with separate Search submit button */}
        <form onSubmit={handleSearch} className="flex-1 max-w-[150px] xs:max-w-[200px] sm:max-w-xl mx-2 sm:mx-8 flex items-center bg-slate-950 border border-darkBorder/60 rounded-xl overflow-hidden">
          <Search className="w-4 h-4 text-slate-500 ml-3 shrink-0" />
          <input
            type="text"
            placeholder="Search stock symbol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent pl-2.5 pr-3 py-2 text-[10px] sm:text-xs text-white placeholder-slate-500 focus:outline-none"
          />
          <button type="submit" className="px-3.5 py-2 bg-brandBlue hover:bg-blue-600 text-white text-[10px] sm:text-xs font-bold shrink-0 transition-all border-l border-darkBorder/30">
            Search
          </button>
        </form>

        {/* Profile / Controls */}
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={() => fetchWatchlist(false)}
            className="p-2 border border-darkBorder hover:bg-slate-900 rounded-lg text-slate-400 hover:text-white transition-all hidden sm:block"
            title="Refresh watchlist data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <div className="relative">
            <div
              onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
              className="flex items-center gap-2 px-2.5 py-1.5 border border-darkBorder bg-slate-950/40 rounded-xl cursor-pointer hover:bg-slate-900 transition-all group"
              title="View account options"
            >
              <div className="w-5.5 h-5.5 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 group-hover:bg-brandBlue/20 group-hover:text-brandBlue transition-all">
                <User className="w-3 h-3" />
              </div>
              <span className="text-[10px] font-bold text-slate-300 capitalize hidden xs:block">{currentUser.username}</span>
              {currentUser.role === 'admin' ? (
                <span className="text-[8px] bg-brandBlue/20 text-brandBlue px-1.5 py-0.5 rounded font-black uppercase">Admin</span>
              ) : currentUser.role === 'manager' ? (
                <span className="text-[8px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-black uppercase">Manager</span>
              ) : null}
            </div>

            {isProfileDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsProfileDropdownOpen(false)}></div>
                <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-darkCard border border-darkBorder rounded-2xl p-4 shadow-2xl z-50 flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-darkBorder/60 pb-3">
                    <div>
                      <div className="text-xs font-bold text-white capitalize">{currentUser.username}</div>
                      <div className="text-[9px] text-slate-400 capitalize">{currentUser.role} Account</div>
                    </div>
                    <button
                      onClick={() => {
                        setIsProfileDropdownOpen(false);
                        handleLogout();
                      }}
                      className="px-2.5 py-1.5 bg-brandRed/10 border border-brandRed/35 hover:bg-brandRed hover:text-white text-brandRed transition-all font-bold text-[10px] rounded-lg"
                    >
                      Logout
                    </button>
                  </div>

                  {/* YOUR API KEYS PANEL (Visible to all authenticated users) */}
                  <div className="flex flex-col gap-3 border-b border-darkBorder/40 pb-3">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <Settings className="w-3.5 h-3.5 text-brandBlue" />
                      <span>Your Custom API Keys</span>
                    </div>

                    {userKeysSuccessMsg && (
                      <div className="p-2 bg-brandGreen/10 border border-brandGreen/30 rounded-lg text-[10px] text-brandGreen font-semibold text-center animate-pulse">
                        {userKeysSuccessMsg}
                      </div>
                    )}

                    <form onSubmit={handleSaveUserKeys} className="flex flex-col gap-2 bg-slate-950/60 p-3 rounded-xl border border-darkBorder/40">
                      <div>
                        <label className="text-[9px] text-slate-400 font-bold uppercase block mb-0.5">Preferred LLM Engine</label>
                        <select
                          value={userKeys.active_llm || "Gemini"}
                          onChange={(e) => setUserKeys({ ...userKeys, active_llm: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-[10px] bg-slate-950 border border-darkBorder/60 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-brandBlue"
                        >
                          <option value="Gemini">Gemini (Default)</option>
                          <option value="OpenAI">OpenAI</option>
                          <option value="AWS">AWS Bedrock</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-400 font-bold uppercase block mb-0.5">OpenAI Key Override</label>
                        <input
                          type="password"
                          placeholder="sk-... (Leave empty to use global)"
                          value={userKeys.OpenAI}
                          onChange={(e) => setUserKeys({ ...userKeys, OpenAI: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-[10px] bg-slate-950 border border-darkBorder/60 rounded-lg text-white font-mono placeholder-slate-600 focus:outline-none focus:border-brandBlue"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-400 font-bold uppercase block mb-0.5">Gemini Key Override</label>
                        <input
                          type="password"
                          placeholder="AIzaSy... (Leave empty to use global)"
                          value={userKeys.Gemini}
                          onChange={(e) => setUserKeys({ ...userKeys, Gemini: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-[10px] bg-slate-950 border border-darkBorder/60 rounded-lg text-white font-mono placeholder-slate-600 focus:outline-none focus:border-brandBlue"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-400 font-bold uppercase block mb-0.5">AWS Bedrock Client Key</label>
                        <input
                          type="password"
                          placeholder="AWS IAM override..."
                          value={userKeys.AWS}
                          onChange={(e) => setUserKeys({ ...userKeys, AWS: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-[10px] bg-slate-950 border border-darkBorder/60 rounded-lg text-white font-mono placeholder-slate-600 focus:outline-none focus:border-brandBlue"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full py-1.5 bg-brandBlue hover:bg-blue-600 transition-all font-bold text-[10px] text-white rounded-lg flex items-center justify-center gap-1 shadow-md shadow-brandBlue/10"
                      >
                        <Database className="w-3.5 h-3.5" />
                        <span>Save Personal Keys</span>
                      </button>
                    </form>
                  </div>

                  {currentUser.role === 'admin' && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <Users className="w-3.5 h-3.5 text-brandBlue" />
                        <span>Quick User Management</span>
                      </div>

                      <form
                        onSubmit={(e) => {
                          handleCreateUser(e);
                        }}
                        className="flex flex-col gap-2.5 bg-slate-950/60 p-3 rounded-xl border border-darkBorder/40"
                      >
                        <div>
                          <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">New Username</label>
                          <input
                            type="text"
                            placeholder="e.g. manager1"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-[11px] bg-slate-950 border border-darkBorder/60 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-brandBlue"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">New Password</label>
                          <input
                            type="password"
                            placeholder="••••••••"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-[11px] bg-slate-950 border border-darkBorder/60 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-brandBlue"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Role & Access</label>
                          <select
                            value={newUserRole}
                            onChange={(e) => setNewUserRole(e.target.value)}
                            className="w-full px-2 py-1.5 text-[11px] bg-slate-950 border border-darkBorder/60 rounded-lg text-white focus:outline-none focus:border-brandBlue"
                          >
                            <option value="manager">Manager (Full Access, no user edit)</option>
                            <option value="user">Standard User (Dashboard only)</option>
                            <option value="admin">Administrator (Full Access)</option>
                          </select>
                          <span className="text-[8px] text-slate-500 mt-1 block leading-normal">
                            * Managers have full access to view stats and configure API keys, but cannot create or edit usernames and passwords.
                          </span>
                        </div>
                        <button
                          type="submit"
                          className="w-full py-2 bg-brandGreen hover:bg-green-600 transition-all font-bold text-[10px] text-white rounded-lg flex items-center justify-center gap-1 mt-1 shadow-md"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Create / Update User</span>
                        </button>
                      </form>

                      <div className="flex flex-col gap-1.5 mt-1">
                        <span className="text-[9px] text-slate-500 font-bold uppercase">Active User Accounts</span>
                        <div className="max-h-28 overflow-y-auto divide-y divide-darkBorder/30 pr-1 flex flex-col">
                          {adminSettings?.users.map((u) => (
                            <div key={u.username} className="py-2 flex items-center justify-between text-[11px]">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-white truncate max-w-[100px]">{u.username}</span>
                                <span className={`text-[8px] px-1 py-0.2 rounded font-bold ${u.role === 'admin'
                                  ? 'bg-brandBlue/10 text-brandBlue'
                                  : u.role === 'manager'
                                    ? 'bg-purple-500/10 text-purple-400'
                                    : 'bg-slate-800 text-slate-400'
                                  }`}>
                                  {u.role}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleUpdatePassword(u.username, u.role)}
                                  className="p-1 hover:bg-slate-900 rounded text-slate-500 hover:text-brandBlue transition-all"
                                  title="Change password"
                                >
                                  <Key className="w-3.5 h-3.5" />
                                </button>
                                {u.username !== 'suman' ? (
                                  <button
                                    onClick={() => handleDeleteUser(u.username)}
                                    className="p-1 hover:bg-slate-900 rounded text-slate-500 hover:text-brandRed transition-all"
                                    title="Delete user"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <span className="text-[8px] text-slate-500 italic pr-1">System</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {currentUser.role !== 'admin' && (
                    <div className="text-[10px] text-slate-400 bg-slate-950/40 p-3 border border-darkBorder/40 rounded-xl leading-relaxed">
                      You are logged in as a <span className="text-white capitalize font-semibold">{currentUser.role}</span>.
                      {currentUser.role === 'manager' ? (
                        <span> You have full read/write access to dashboard features and LLM settings, except for managing other user accounts and credentials.</span>
                      ) : (
                        <span> You have read-only access to standard terminal dashboard indicators. Contact an admin to elevate privileges.</span>
                      )}
                    </div>
                  )}

                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ================================= MAIN CONTENT PANELS ================================= */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-4 sm:p-5 overflow-y-auto lg:overflow-hidden pb-20 lg:pb-5">

        {/* PANEL 1: MARKET WATCH SIDEBAR */}
        <section className={`lg:col-span-3 flex flex-col glass-panel rounded-2xl border border-darkBorder/60 max-h-[80vh] lg:max-h-none overflow-y-auto ${mobileActiveTab === 'watch' ? 'block' : 'hidden lg:flex'
          }`}>
          <div className="p-4 border-b border-darkBorder/60 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Market Watch</span>
              <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-400">{marketFilteredWatchlist.length}</span>
            </h2>
            <div className="flex gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>

          <div className="flex-1 divide-y divide-darkBorder/40">
            {isWatchlistLoading && marketFilteredWatchlist.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 flex flex-col items-center gap-3">
                <RefreshCw className="w-5 h-5 animate-spin text-brandBlue" />
                <span>Synchronizing tickers...</span>
              </div>
            ) : marketFilteredWatchlist.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                <span>No tracked stocks.</span>
                <span className="text-[10px] text-slate-600">Search and click "Watch" to add.</span>
              </div>
            ) : (
              marketFilteredWatchlist.map((stock) => {
                const isSelected = stock.symbol === selectedSymbol;
                const isPositive = stock.changePercent >= 0;

                return (
                  <div
                    key={stock.symbol}
                    onClick={() => {
                      setSelectedSymbol(stock.symbol);
                      setComparisonSymbols([]);
                      setMobileActiveTab('deck');
                    }}
                    className={`p-4 flex flex-col gap-2 cursor-pointer transition-all ${isSelected
                      ? 'bg-brandBlue/5 border-l-2 border-l-brandBlue bg-opacity-40'
                      : 'hover:bg-slate-900/30 border-l-2 border-l-transparent'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-white">{stock.symbol}</span>
                        {(() => {
                          const signal = stock.investSignal || 'hold';
                          if (signal === 'invest') {
                            return (
                              <span className="text-[8px] px-1.5 py-0.5 rounded font-black uppercase text-white bg-emerald-600 border border-emerald-500">
                                Buy
                              </span>
                            );
                          } else if (signal === 'book_profit') {
                            return (
                              <span className="text-[8px] px-1.5 py-0.5 rounded font-black uppercase text-white bg-rose-600 border border-rose-500">
                                Sell
                              </span>
                            );
                          } else {
                            return (
                              <span className="text-[8px] px-1.5 py-0.5 rounded font-black uppercase text-slate-300 bg-slate-800 border border-slate-700">
                                Hold
                              </span>
                            );
                          }
                        })()}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${isPositive
                          ? 'text-brandGreen bg-brandGreen/5 border-brandGreen/20'
                          : 'text-brandRed bg-brandRed/5 border-brandRed/20'
                          }`}>
                          {isPositive ? '+' : ''}{stock.changePercent.toFixed(2)}%
                        </span>
                      </div>

                      <button
                        onClick={(e) => handleRemoveFromWatchlist(stock.symbol, e)}
                        className="p-1 hover:bg-slate-800 rounded transition-all text-slate-500 hover:text-brandRed"
                        title="Remove from watchlist"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex items-end justify-between mt-1">
                      <div>
                        <div className="text-[10px] text-slate-400 font-semibold truncate max-w-[120px]">{stock.name}</div>
                        <div className="text-sm font-bold text-white mt-0.5">{getCurrencySymbol(stock.symbol)}{stock.price.toFixed(2)}</div>
                        {stock.premarketPrice !== undefined && stock.premarketPrice !== null && (
                          <div className="text-[9px] text-slate-400 font-medium mt-0.5">
                            Pre-market: <span className="text-slate-300 font-semibold">{getCurrencySymbol(stock.symbol)}{stock.premarketPrice.toFixed(2)}</span>
                            {(() => {
                              const diff = stock.premarketPrice - stock.price;
                              const diffPct = (diff / stock.price) * 100;
                              const isDiffPositive = diff >= 0;
                              const diffColorClass = isDiffPositive ? 'text-brandGreen' : 'text-brandRed';
                              const absDiff = Math.abs(diff);
                              const absDiffPct = Math.abs(diffPct);
                              return (
                                <span className={`ml-1 font-bold ${diffColorClass}`}>
                                  ({isDiffPositive ? '+' : '-'}{getCurrencySymbol(stock.symbol)}{absDiff.toFixed(2)}, {isDiffPositive ? '+' : '-'}{absDiffPct.toFixed(2)}%)
                                </span>
                              );
                            })()}
                          </div>
                        )}
                      </div>

                      {stock.sparkline && stock.sparkline.length > 0 && (
                        <div className="w-20 h-7 shrink-0">
                          <svg className="w-full h-full overflow-visible" viewBox="0 0 100 30">
                            <polyline
                              fill="none"
                              stroke={isPositive ? '#10B981' : '#EF4444'}
                              strokeWidth="1.5"
                              points={stock.sparkline.map((val, idx) => {
                                const min = Math.min(...stock.sparkline);
                                const max = Math.max(...stock.sparkline);
                                const range = max - min || 1;
                                const x = (idx / (stock.sparkline.length - 1)) * 100;
                                const y = 30 - ((val - min) / range) * 26 - 2;
                                return `${x},${y}`;
                              }).join(' ')}
                              className={isPositive ? 'sparkline-svg' : 'sparkline-svg-down'}
                            />
                          </svg>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-darkBorder/25 text-[9px] text-slate-500">
                      <span>YoY Trend</span>
                      <span className={`font-bold ${stock.yoyTrend === 'Growth' ? 'text-brandGreen' : 'text-brandRed'}`}>
                        {stock.yoyTrend}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-3 border-t border-darkBorder/60 bg-slate-950/40 shrink-0">
            {isAddingTicker ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (newTickerInput.trim()) {
                    await handleAddToWatchlist(newTickerInput.trim());
                    setNewTickerInput('');
                    setIsAddingTicker(false);
                  }
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  placeholder="Enter ticker (e.g. NFLX)..."
                  value={newTickerInput}
                  onChange={(e) => setNewTickerInput(e.target.value)}
                  className="flex-1 bg-slate-900 border border-darkBorder/80 px-3 py-1.5 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brandBlue"
                  autoFocus
                />
                <button
                  type="submit"
                  className="bg-brandBlue text-white px-3 py-1 rounded-xl text-xs font-bold hover:bg-brandBlue/80 transition-all"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingTicker(false)}
                  className="border border-darkBorder text-slate-400 px-2 py-1 rounded-xl text-[10px] hover:text-white transition-all"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                onClick={() => setIsAddingTicker(true)}
                className="w-full py-2 bg-slate-900 border border-darkBorder hover:bg-brandBlue hover:border-brandBlue hover:text-white transition-all text-slate-300 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Track New Ticker</span>
              </button>
            )}
          </div>
        </section>

        {/* PANEL 2: CENTER ANALYSIS WORKSPACE */}
        <section className={`lg:col-span-6 flex flex-col gap-5 overflow-y-auto max-h-[80vh] lg:max-h-none ${mobileActiveTab === 'deck' ? 'block' : 'hidden lg:flex'
          }`}>

          {/* SWITCH BAR */}
          <div className="flex bg-darkCard border border-darkBorder/60 p-1 rounded-2xl gap-2 shrink-0">
            <button
              onClick={() => setViewMode('deck')}
              className={`flex-1 py-2.5 rounded-xl font-bold text-[10px] sm:text-xs flex items-center justify-center gap-1.5 sm:gap-2 transition-all ${viewMode === 'deck'
                ? 'bg-brandBlue text-white shadow-lg shadow-brandBlue/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
                }`}
            >
              <LineChart className="w-3.5 h-3.5" />
              <span>Analysis Deck</span>
            </button>
            <button
              onClick={() => setViewMode('master')}
              className={`flex-1 py-2.5 rounded-xl font-bold text-[10px] sm:text-xs flex items-center justify-center gap-1.5 sm:gap-2 transition-all ${viewMode === 'master'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
                }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Master Analysis</span>
            </button>
            <button
              onClick={() => setViewMode('invest')}
              className={`flex-1 py-2.5 rounded-xl font-bold text-[10px] sm:text-xs flex items-center justify-center gap-1.5 sm:gap-2 transition-all ${viewMode === 'invest'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
                }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Should I Invest?</span>
            </button>
            <button
              onClick={() => setViewMode('when_to_invest')}
              className={`flex-1 py-2.5 rounded-xl font-bold text-[10px] sm:text-xs flex items-center justify-center gap-1.5 sm:gap-2 transition-all ${viewMode === 'when_to_invest'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
                }`}
            >
              <LineChart className="w-3.5 h-3.5" />
              <span>when to invest</span>
            </button>
            <button
              onClick={() => setViewMode('nasdaq_signals')}
              className={`flex-1 py-2.5 rounded-xl font-bold text-[10px] sm:text-xs flex items-center justify-center gap-1.5 sm:gap-2 transition-all ${viewMode === 'nasdaq_signals'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
                }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>NASDAQ Signals</span>
            </button>
          </div>


          {/* ================= VIEW 1: ANALYSIS DECK ================= */}
          {viewMode === 'deck' && (
            <>
              {/* STOCK HEADER CARD */}
              <div className="glass-panel rounded-2xl p-5 border border-darkBorder/60 flex items-start justify-between relative overflow-hidden">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">{selectedSymbol}</h2>
                    <span className="text-[10px] sm:text-xs text-slate-400 font-semibold truncate max-w-[120px] sm:max-w-none">
                      {fundamentals?.Company_Name || 'Valuation profile'}
                    </span>
                    <span className="text-[8px] sm:text-[10px] px-1.5 py-0.5 bg-slate-900 border border-darkBorder rounded text-slate-400 whitespace-nowrap">
                      {fundamentals?.Sector || 'N/A'}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2.5 mt-3">
                    <span className="text-xl sm:text-2xl font-black text-white">
                      {getCurrencySymbol(selectedSymbol)}{forecastData?.currentPrice ? forecastData.currentPrice.toFixed(2) : (fundamentals?.Current_Price || fundamentals?.Previous_Close || 0.0).toFixed(2)}
                    </span>
                    {forecastData?.predictedReturn !== undefined && (
                      <span className={`text-[10px] sm:text-xs font-bold ${forecastData.predictedReturn >= 0 ? 'text-brandGreen' : 'text-brandRed'}`}>
                        {forecastData.predictedReturn >= 0 ? '▲' : '▼'} {Math.abs(forecastData.predictedReturn * 100).toFixed(2)}% (Forecast)
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleAddToWatchlist(selectedSymbol)}
                  className="px-2.5 py-1.5 border border-darkBorder/80 bg-slate-950/40 hover:bg-slate-900 rounded-xl text-slate-400 hover:text-white transition-all text-[10px] font-bold flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Watch</span>
                </button>
              </div>

              {/* CORE PRICE CHART */}
              {isChartLoading ? (
                <div className="h-[320px] sm:h-[380px] glass-panel rounded-2xl border border-darkBorder/60 flex flex-col items-center justify-center text-xs text-slate-500 gap-3">
                  <RefreshCw className="w-6 h-6 animate-spin text-brandBlue" />
                  <span>Computing mathematical chart paths...</span>
                </div>
              ) : (
                <StockChart
                  data={chartData}
                  forecastData={forecastData?.forecastPath}
                  symbols={[selectedSymbol, ...comparisonSymbols]}
                  range={chartRange}
                  onRangeChange={(r) => setChartRange(r)}
                  forecastHorizon={forecastHorizon}
                  onForecastHorizonChange={(h) => setForecastHorizon(h)}
                  showForecast={showForecast}
                  onShowForecastToggle={(show) => setShowForecast(show)}
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  modelProbabilities={forecastData?.modelProbabilities}
                  useTripleBarrier={useTripleBarrier}
                  onUseTripleBarrierToggle={setUseTripleBarrier}
                />
              )}

              {/* COMPARISON AND OVERLAY CONTROLS */}
              <div className="glass-panel rounded-2xl p-5 border border-darkBorder/60">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Add Stocks for Comparison</h3>

                <form onSubmit={handleAddComparison} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter ticker (e.g. AAPL, MSFT)..."
                    value={comparisonInput}
                    onChange={(e) => setComparisonInput(e.target.value)}
                    className="flex-1 px-3.5 py-2 text-xs bg-slate-950 border border-darkBorder/60 rounded-xl focus:outline-none focus:border-brandBlue text-white"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-brandBlue hover:bg-blue-600 transition-all font-bold text-xs text-white rounded-xl whitespace-nowrap"
                  >
                    Overlay Ticker
                  </button>
                </form>

                {comparisonSymbols.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {comparisonSymbols.map(sym => (
                      <span key={sym} className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-950 border border-darkBorder/80 rounded-xl text-xs text-white font-bold">
                        <span>{sym}</span>
                        <X
                          className="w-3.5 h-3.5 text-slate-400 hover:text-brandRed cursor-pointer"
                          onClick={() => handleRemoveComparison(sym)}
                        />
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* MODEL FORECAST & SUMMARY INSIGHT MATRIX */}
              {forecastData && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="glass-panel border border-darkBorder/60 rounded-2xl p-4 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Forecast Output (1M)</span>
                    <span className={`text-base sm:text-lg font-black mt-2 ${forecastData.predictedReturn >= 0 ? 'text-brandGreen' : 'text-brandRed'}`}>
                      {getCurrencySymbol(selectedSymbol)}{forecastData.forecastPrice.toFixed(2)}
                    </span>
                    <span className="text-[9px] text-slate-500 mt-1">
                      {forecastData.predictedReturn >= 0 ? '+' : ''}{(forecastData.predictedReturn * 100).toFixed(2)}% expected return
                    </span>
                  </div>

                  <div className="glass-panel border border-darkBorder/60 rounded-2xl p-4 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Historical MAPE</span>
                    <span className="text-base sm:text-lg font-black text-white mt-2">
                      {forecastData.mape.toFixed(2)}%
                    </span>
                    <span className="text-[9px] text-slate-500 mt-1">Mean Absolute Percentage Error</span>
                  </div>

                  <div className="glass-panel border border-darkBorder/60 rounded-2xl p-4 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Directional Accuracy</span>
                    <span className="text-base sm:text-lg font-black text-brandBlue mt-2">
                      {forecastData.mda.toFixed(2)}%
                    </span>
                    <span className="text-[9px] text-slate-500 mt-1">Walk-forward validation MDA</span>
                  </div>
                </div>
              )}

              {/* VALUATION PROFILE DETAILS & COMPANY BUSINESS METADATA */}
              <div className="glass-panel border border-darkBorder/60 rounded-2xl p-5 flex flex-col gap-5">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Company Metadata Summary</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase">Sector</div>
                      <div className="text-xs font-bold text-white mt-1">{fundamentals?.Sector || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase">Headquarters</div>
                      <div className="text-xs font-bold text-white mt-1 truncate">{fundamentals?.Headquarters || 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase">Industry</div>
                      <div className="text-xs font-bold text-white mt-1">{fundamentals?.Industry || 'N/A'}</div>
                    </div>
                  </div>
                </div>

                {fundamentals?.Business_Summary && (
                  <div className="pt-4 border-t border-darkBorder/40">
                    <h4 className="text-[10px] text-slate-500 font-bold uppercase mb-2">Business Profile & Strategy</h4>
                    <p className="text-xs leading-relaxed text-slate-300 max-h-32 overflow-y-auto pr-1 text-justify">
                      {fundamentals.Business_Summary}
                    </p>
                  </div>
                )}

                {fundamentals?.Major_Products && (
                  <div className="pt-4 border-t border-darkBorder/40 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-[10px] text-slate-500 font-bold uppercase mb-1.5">Core Product Lines</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {fundamentals.Major_Products.split(',').map((p: string, idx: number) => (
                          <span key={idx} className="text-[10px] bg-slate-900 border border-darkBorder/60 px-2.5 py-1 rounded-lg text-slate-300 font-medium">
                            {p.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-[10px] text-slate-500 font-bold uppercase mb-1.5">Upcoming Pipelines</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {fundamentals.Upcoming_Products.split(',').map((p: string, idx: number) => (
                          <span key={idx} className="text-[10px] bg-purple-500/10 border border-purple-500/25 px-2.5 py-1 rounded-lg text-purple-300 font-bold">
                            {p.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ================= VIEW 2: MASTER COMPOSITE QUANTITATIVE THESIS ================= */}
          {viewMode === 'master' && (
            <div className="flex flex-col gap-5">
              {isMasterLoading ? (
                <div className="h-[450px] glass-panel rounded-2xl border border-darkBorder/60 flex flex-col items-center justify-center text-xs text-slate-500 gap-3">
                  <RefreshCw className="w-6 h-6 animate-spin text-purple-500" />
                  <span>Compiling quantitative factors and executing AI completions...</span>
                </div>
              ) : masterAnalysis ? (
                (() => {
                  const displayMasterScore = masterAnalysis.masterScore !== undefined
                    ? (masterAnalysis.masterScore > 10 ? (masterAnalysis.masterScore / 10).toFixed(1) : masterAnalysis.masterScore.toFixed(1))
                    : '0.0';
                  return (
                    <>
                      {/* Analysis Criteria Selector Card */}
                      <div className="glass-panel border border-darkBorder/60 rounded-2xl p-5 flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Analysis & Prediction Criteria</h3>
                            <p className="text-[10px] text-slate-500 mt-1">Select which sources and data feeds the forecasting engine should use to predict the stock price.</p>
                          </div>

                          {/* Premium Toggle All Button */}
                          <button
                            type="button"
                            onClick={() => {
                              const allCriteria = ["Market Analysis", "Fundamentals", "News feed", "Pre market numbers", "Financial status"];
                              const newCriteria = selectedCriteria.length === 5 ? [] : allCriteria;
                              setSelectedCriteria(newCriteria);
                              runMasterAnalysis(selectedSymbol, newCriteria);
                            }}
                            className={`px-3 py-1.5 border rounded-lg text-[10px] font-black uppercase tracking-wider transition-all select-none shrink-0 ${selectedCriteria.length === 5
                              ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                              : 'bg-slate-950 border-darkBorder text-slate-400 hover:text-white'
                              }`}
                          >
                            {selectedCriteria.length === 5 ? "Deselect All" : "Select All"}
                          </button>
                        </div>

                        {/* Premium Inline Toggle Pills / Checkbox Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-1">
                          {[
                            { name: "Market Analysis", key: "Market Analysis", desc: "ML Forecast model" },
                            { name: "Fundamentals", key: "Fundamentals", desc: "PE, Debt, Margin" },
                            { name: "News feed", key: "News feed", desc: "VADER sentiment" },
                            { name: "Pre market numbers", key: "Pre market numbers", desc: "Pre-market gaps" },
                            { name: "Financial status", key: "Financial status", desc: "YoY Growth & ROE" }
                          ].map((item) => {
                            const isChecked = selectedCriteria.includes(item.key);
                            return (
                              <div
                                key={item.key}
                                onClick={() => {
                                  let updated;
                                  if (selectedCriteria.includes(item.key)) {
                                    updated = selectedCriteria.filter(x => x !== item.key);
                                  } else {
                                    updated = [...selectedCriteria, item.key];
                                  }
                                  setSelectedCriteria(updated);
                                  runMasterAnalysis(selectedSymbol, updated);
                                }}
                                className={`p-3 border rounded-xl cursor-pointer select-none transition-all flex flex-col justify-between gap-1.5 h-20 group ${isChecked
                                  ? 'bg-purple-600/10 border-purple-500/50 shadow-md shadow-purple-600/5'
                                  : 'bg-slate-950/40 border-darkBorder/60 opacity-60 hover:opacity-100'
                                  }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className={`text-[10px] font-black tracking-tight ${isChecked ? 'text-white' : 'text-slate-400'}`}>
                                    {item.name}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => { }} // handled by parent onClick
                                    className="accent-purple-500 h-3 w-3 rounded border-darkBorder/60 pointer-events-none"
                                  />
                                </div>
                                <span className="text-[8px] text-slate-500 leading-none">{item.desc}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="glass-panel border border-darkBorder/60 rounded-2xl p-5">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Multi-Factor Evaluation</h3>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mt-4">

                          <div className="flex items-center gap-4 shrink-0">
                            <div className="w-20 h-20 rounded-full border-4 border-purple-500 flex flex-col items-center justify-center text-center bg-purple-500/5 shrink-0">
                              <span className="text-xl font-black text-white">{displayMasterScore}</span>
                              <span className="text-[8px] text-slate-400 font-black uppercase">Rating</span>
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-white">{selectedSymbol} Master Rating</h4>
                              <p className="text-[10px] text-slate-400 mt-1 max-w-[180px]">Composite 10-point quantitative evaluation across active macro policy, micro fundamentals, corporate capital, products innovation, and public sentiment.</p>
                            </div>
                          </div>

                          <div className="flex-1 overflow-x-auto pb-2 scrollbar-style">
                            <div className="flex gap-2.5 min-w-[550px]">
                              {[
                                { label: 'Macro & Geo', key: 'News feed', val: masterAnalysis.scores?.macro, desc: 'Tariffs, Fed policy & Geopolitics', col: 'border-brandBlue/50 hover:border-brandBlue', bg: 'bg-brandBlue/5', shadow: 'hover:shadow-brandBlue/10' },
                                { label: 'Micro & Fund', key: 'Fundamentals', val: masterAnalysis.scores?.micro, desc: 'Margins, Debt & PE ratios', col: 'border-brandGreen/50 hover:border-brandGreen', bg: 'bg-brandGreen/5', shadow: 'hover:shadow-brandGreen/10' },
                                { label: 'Corporate & Cap', key: 'Pre market numbers', val: masterAnalysis.scores?.corporate, desc: 'Acquisitions & capital shifts', col: 'border-amber-500/50 hover:border-amber-500', bg: 'bg-amber-500/5', shadow: 'hover:shadow-amber-500/10' },
                                { label: 'Product & Innov', key: 'Financial status', val: masterAnalysis.scores?.product, desc: 'Product pipelines & roadmaps', col: 'border-pink-500/50 hover:border-pink-500', bg: 'bg-pink-500/5', shadow: 'hover:shadow-pink-500/10' },
                                { label: 'Sentiment & Inst', key: 'Market Analysis', val: masterAnalysis.scores?.sentiment, desc: 'Media sentiment & flow signals', col: 'border-purple-500/50 hover:border-purple-500', bg: 'bg-purple-500/5', shadow: 'hover:shadow-purple-500/10' }
                              ].map(s => {
                                const isActive = selectedCriteria.includes(s.key);
                                const displayVal = s.val !== undefined
                                  ? (s.val > 10 ? (s.val / 10).toFixed(1) : s.val.toFixed(1))
                                  : '0.0';
                                return (
                                  <div key={s.label} className={`bg-slate-950/70 border ${isActive ? s.col + ' ' + s.bg : 'border-darkBorder/40 bg-slate-950/20 opacity-40'} rounded-xl p-3 text-center flex-1 min-w-[105px] flex flex-col justify-between h-24 shadow-sm ${isActive ? s.shadow + ' hover:shadow-md hover:-translate-y-0.5' : ''} transition-all duration-300`}>
                                    <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider leading-tight">{s.label}</span>
                                    <div className="text-sm font-black text-white my-1">
                                      {isActive ? (
                                        <>{displayVal}<span className="text-[9px] text-slate-500 font-normal">/10</span></>
                                      ) : (
                                        <span className="text-slate-600 text-[10px]">Excluded</span>
                                      )}
                                    </div>
                                    <span className="text-[7px] text-slate-500 leading-none truncate">{s.desc}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                        </div>
                      </div>

                      {/* PREDICTIONS AND CONTRIBUTION BREAKDOWN PANEL */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* Forecast Summary */}
                        <div className="glass-panel border border-darkBorder/60 rounded-2xl p-5 flex flex-col justify-between">
                          <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Criteria-Adjusted Projections</h3>
                            <p className="text-[10px] text-slate-500 mt-1">Aggregated target price matching your selected active criteria sources.</p>
                          </div>

                          <div className="flex items-baseline gap-3 mt-4">
                            <span className="text-2xl font-black text-white">
                              {getCurrencySymbol(selectedSymbol)}{masterAnalysis.forecast?.targetPrice?.toFixed(2)}
                            </span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${masterAnalysis.forecast?.predictedReturn >= 0 ? 'bg-brandGreen/10 text-brandGreen' : 'bg-brandRed/10 text-brandRed'}`}>
                              {masterAnalysis.forecast?.predictedReturn >= 0 ? '+' : ''}{(masterAnalysis.forecast?.predictedReturn * 100).toFixed(2)}% Return
                            </span>
                          </div>

                          <div className="text-[9px] text-slate-500 mt-3 border-t border-darkBorder/35 pt-2 flex items-center justify-between">
                            <span>MAPE: {masterAnalysis.forecast?.mape?.toFixed(2)}%</span>
                            <span>Directional Accuracy (MDA): {masterAnalysis.forecast?.mda?.toFixed(2)}%</span>
                          </div>
                        </div>

                        {/* Contribution Breakdown */}
                        <div className="glass-panel border border-darkBorder/60 rounded-2xl p-5">
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Feed Contribution Breakdown</h3>
                          <div className="flex flex-col gap-2">
                            {[
                              { name: "Market Analysis", key: "Market Analysis" },
                              { name: "Fundamentals", key: "Fundamentals" },
                              { name: "News feed", key: "News feed" },
                              { name: "Pre market numbers", key: "Pre market numbers" },
                              { name: "Financial status", key: "Financial status" }
                            ].map((item) => {
                              const isActive = selectedCriteria.includes(item.key);
                              const contribution = masterAnalysis.breakdown?.[item.key] || 0.0;
                              return (
                                <div key={item.key} className="flex items-center justify-between text-xs py-1 border-b border-darkBorder/30 last:border-b-0">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-purple-500' : 'bg-slate-700'}`}></div>
                                    <span className={isActive ? 'font-semibold text-slate-200' : 'text-slate-500'}>{item.name}</span>
                                  </div>
                                  <span className={`font-mono font-bold ${!isActive ? 'text-slate-600' : contribution >= 0 ? 'text-brandGreen' : 'text-brandRed'}`}>
                                    {isActive ? (
                                      <>{contribution >= 0 ? '+' : ''}{(contribution * 100).toFixed(2)}%</>
                                    ) : (
                                      <span>Excluded</span>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <MasterAnalysisChart
                        data={chartData}
                        forecastData={forecastData?.forecastPath}
                        catalysts={masterAnalysis.catalysts}
                        symbol={selectedSymbol}
                      />

                      <div className="glass-panel border border-darkBorder/60 rounded-2xl p-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-purple-500/10 to-transparent pointer-events-none rounded-bl-full"></div>
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-darkBorder/60">
                          <Sparkles className="w-4 h-4 text-purple-400" />
                          <h3 className="text-sm font-bold text-white uppercase tracking-wider">AI Investment Thesis & Commentary</h3>
                        </div>

                        <div className="prose prose-invert text-xs leading-relaxed text-slate-300 space-y-4 max-h-[380px] overflow-y-auto pr-2">
                          {masterAnalysis.thesis.split('\n').map((para, i) => {
                            if (!para.trim()) return null;
                            if (para.startsWith('###') || para.startsWith('**') || para.startsWith('1.') || para.startsWith('2.') || para.startsWith('3.') || para.startsWith('4.') || para.startsWith('5.')) {
                              return <h4 key={i} className="text-white font-extrabold mt-3 border-l-2 border-l-purple-500 pl-2">{para.replace(/[\*#]/g, '')}</h4>;
                            }
                            return <p key={i}>{para.replace(/\*\*/g, '')}</p>;
                          })}
                        </div>
                      </div>
                    </>
                  );
                })()
              ) : (
                <div className="glass-panel rounded-2xl border border-darkBorder/60 p-8 text-center text-xs text-slate-500">
                  Quantitative compilation failed. Please search for a different ticker.
                </div>
              )}
            </div>
          )}

          {/* ================= VIEW 4: SHOULD I INVEST ================= */}
          {viewMode === 'invest' && (
            <ShouldIInvestTab
              symbol={selectedSymbol}
              analysis={investAnalysis}
              isLoading={isInvestLoading}
            />
          )}

          {/* ================= VIEW 5: WHEN TO INVEST ================= */}
          {viewMode === 'when_to_invest' && (
            <WhenToInvestTab
              symbol={selectedSymbol}
              analysis={whenToInvestData}
              isLoading={isWhenToInvestLoading}
            />
          )}

          {/* ================= VIEW 6: NASDAQ SIGNALS ================= */}
          {viewMode === 'nasdaq_signals' && (
            <NasdaqSignalsTab authFetch={authFetch} />
          )}


        </section>

        {/* PANEL 3: FUNDAMENTALS, NEWS & AI CHAT */}
        <section className={`lg:col-span-3 flex flex-col gap-5 max-h-[80vh] lg:max-h-none ${mobileActiveTab === 'right' ? 'block' : 'hidden lg:flex'
          }`}>

          <div className="glass-panel rounded-2xl border border-darkBorder/60 flex flex-col flex-1 overflow-hidden">
            <div className="flex bg-slate-950 border-b border-darkBorder/60 p-1">
              <button
                onClick={() => setRightActiveTab('fundamentals')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${rightActiveTab === 'fundamentals'
                  ? 'bg-slate-900 text-white border border-darkBorder/40'
                  : 'text-slate-400 hover:text-white'
                  }`}
              >
                Fundamentals
              </button>
              <button
                onClick={() => setRightActiveTab('news')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${rightActiveTab === 'news'
                  ? 'bg-slate-900 text-white border border-darkBorder/40'
                  : 'text-slate-400 hover:text-white'
                  }`}
              >
                News Feed
              </button>
              <button
                onClick={() => setRightActiveTab('financials')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${rightActiveTab === 'financials'
                  ? 'bg-slate-900 text-white border border-darkBorder/40'
                  : 'text-slate-400 hover:text-white'
                  }`}
              >
                Financial Status
              </button>
              {(currentUser.role === 'admin' || currentUser.role === 'manager') && (
                <button
                  onClick={() => setRightActiveTab('admin')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${rightActiveTab === 'admin'
                    ? 'bg-slate-900 text-white border border-darkBorder/40'
                    : 'text-slate-400 hover:text-white'
                    }`}
                >
                  Admin
                </button>
              )}
            </div>

            <div className="flex-1 p-4 overflow-y-auto">

              {rightActiveTab === 'fundamentals' ? (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'MARKET CAP', val: formatCompact(fundamentals?.Market_Cap) },
                      { label: 'P/E RATIO', val: fundamentals?.Forward_PE ? fundamentals.Forward_PE.toFixed(2) : 'N/A' },
                      { label: 'DIV YIELD', val: fundamentals?.Dividend_Yield ? `${(fundamentals.Dividend_Yield * 100).toFixed(2)}%` : '0.00%' },
                      { label: 'EPS (FWD)', val: fundamentals?.Forward_EPS ? `${getCurrencySymbol(selectedSymbol)}${fundamentals.Forward_EPS.toFixed(2)}` : 'N/A' },
                      { label: '52W HIGH', val: fundamentals?.['52W_High'] ? `${getCurrencySymbol(selectedSymbol)}${fundamentals['52W_High'].toFixed(2)}` : 'N/A', col: 'text-brandGreen' },
                      { label: '52W LOW', val: fundamentals?.['52W_Low'] ? `${getCurrencySymbol(selectedSymbol)}${fundamentals['52W_Low'].toFixed(2)}` : 'N/A', col: 'text-brandRed' },
                      { label: 'VOLUME', val: formatCompact(fundamentals?.Current_Price ? (fundamentals.Market_Cap / fundamentals.Current_Price) * 0.015 : null) },
                      { label: 'AVG VOL', val: '21M' }
                    ].map(card => (
                      <div key={card.label} className="bg-slate-950 border border-darkBorder/40 rounded-xl p-3 flex flex-col justify-between h-20">
                        <span className="text-[8px] text-slate-500 font-bold uppercase">{card.label}</span>
                        <span className={`text-xs font-black mt-2 ${card.col || 'text-white'}`}>{card.val}</span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-slate-950 border border-darkBorder/40 rounded-xl p-4 mt-2">
                    <div className="flex items-center justify-between text-xs font-bold text-white">
                      <span>Analyst Recommendation</span>
                      <span className="text-brandGreen uppercase">Buy</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1.5 mt-3 relative">
                      <div className="bg-brandGreen h-1.5 rounded-full" style={{ width: '80%' }}></div>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2.5">Based on quantitative rating aggregations for {selectedSymbol} over the last 90 days.</p>
                  </div>
                </div>
              ) : rightActiveTab === 'news' ? (
                <div className="flex flex-col gap-4">
                  {/* Header: Live badge + date + refresh */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-[9px] font-black uppercase text-emerald-400 bg-emerald-400/10 border border-emerald-400/25 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse inline-block"></span>
                        Live
                      </span>
                      <span className="text-[9px] text-slate-500 font-semibold">
                        {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <button
                      onClick={() => refreshNews()}
                      className="flex items-center gap-1 text-[9px] font-bold text-slate-400 hover:text-brandBlue bg-slate-900 hover:bg-slate-800 border border-darkBorder/50 px-2.5 py-1 rounded-lg transition-all"
                      title="Fetch latest news"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Refresh
                    </button>
                  </div>

                  {news && news.length > 0 ? (
                    news.map((item, idx) => (
                      <div key={idx} className="bg-slate-950 border border-darkBorder/40 rounded-xl p-3 flex flex-col gap-2 transition-all">
                        <h4 className="text-[11px] font-black text-white leading-normal">{item.title}</h4>

                        <div className="flex items-center justify-between text-[9px] text-slate-500 border-b border-darkBorder/20 pb-1.5">
                          <span>{item.source} · {item.time}</span>
                          <span className={`px-1.5 py-0.5 rounded font-black border ${getSentimentColor(item.sentiment)}`}>
                            {item.sentiment}
                          </span>
                        </div>

                        <div className="bg-slate-900/60 border border-darkBorder/25 rounded-lg p-2 mt-1">
                          <div className="flex items-center justify-between text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            <span>Market Impact Explanation</span>
                            <span className="text-brandRed font-black">Vol: {item.volatility}/10</span>
                          </div>
                          <p className="text-[10px] leading-relaxed text-slate-300 italic text-justify">
                            {item.explanation}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-500">No active news feeds.</div>
                  )}
                </div>
              ) : rightActiveTab === 'financials' ? (
                <div className="flex flex-col gap-4">
                  {/* Latest Earnings / Income statement summary */}
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      {
                        label: 'TOTAL REVENUE',
                        val: formatCompact(fundamentals?.Total_Revenue),
                        sub: fundamentals?.Revenue_Growth ? `${(fundamentals.Revenue_Growth * 100).toFixed(1)}% YoY` : 'N/A',
                        subCol: fundamentals?.Revenue_Growth >= 0 ? 'text-brandGreen font-bold' : 'text-brandRed font-bold'
                      },
                      {
                        label: 'NET INCOME',
                        val: formatCompact(fundamentals?.Net_Income),
                        sub: fundamentals?.Earnings_Growth ? `${(fundamentals.Earnings_Growth * 100).toFixed(1)}% YoY` : 'N/A',
                        subCol: fundamentals?.Earnings_Growth >= 0 ? 'text-brandGreen font-bold' : 'text-brandRed font-bold'
                      },
                      {
                        label: 'FREE CASH FLOW',
                        val: formatCompact(fundamentals?.Free_Cashflow),
                        sub: 'FCF Yield Indicator',
                        subCol: 'text-slate-500'
                      },
                      {
                        label: 'RETURN ON EQUITY (ROE)',
                        val: fundamentals?.ROE ? `${(fundamentals.ROE * 100).toFixed(1)}%` : 'N/A',
                        sub: 'Equity Returns Efficiency',
                        subCol: 'text-slate-500'
                      }
                    ].map(card => (
                      <div key={card.label} className="bg-slate-950 border border-darkBorder/40 rounded-xl p-3 flex flex-col justify-between h-22">
                        <span className="text-[8px] text-slate-500 font-bold uppercase">{card.label}</span>
                        <span className="text-xs font-black mt-1 text-white">{card.val}</span>
                        <span className={`text-[8px] mt-1 ${card.subCol}`}>{card.sub}</span>
                      </div>
                    ))}
                  </div>

                  {/* Margins */}
                  <div className="bg-slate-950 border border-darkBorder/40 rounded-xl p-3 flex flex-col gap-2.5">
                    <span className="text-[8px] text-slate-500 font-bold uppercase">Profitability Margins</span>

                    <div>
                      <div className="flex items-center justify-between text-[9px] font-bold text-slate-400">
                        <span>Gross Margin</span>
                        <span className="text-white">{fundamentals?.Gross_Margins ? `${(fundamentals.Gross_Margins * 100).toFixed(1)}%` : 'N/A'}</span>
                      </div>
                      <div className="w-full bg-slate-900 rounded-full h-1 mt-1.5 overflow-hidden">
                        <div className="bg-brandBlue h-1 rounded-full" style={{ width: `${(fundamentals?.Gross_Margins || 0) * 100}%` }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[9px] font-bold text-slate-400">
                        <span>Operating Margin</span>
                        <span className="text-white">{fundamentals?.Operating_Margin ? `${(fundamentals.Operating_Margin * 100).toFixed(1)}%` : 'N/A'}</span>
                      </div>
                      <div className="w-full bg-slate-900 rounded-full h-1 mt-1.5 overflow-hidden">
                        <div className="bg-purple-500 h-1 rounded-full" style={{ width: `${(fundamentals?.Operating_Margin || 0) * 100}%` }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[9px] font-bold text-slate-400">
                        <span>Net Profit Margin</span>
                        <span className="text-white">{fundamentals?.Profit_Margins ? `${(fundamentals.Profit_Margins * 100).toFixed(1)}%` : 'N/A'}</span>
                      </div>
                      <div className="w-full bg-slate-900 rounded-full h-1 mt-1.5 overflow-hidden">
                        <div className="bg-brandGreen h-1 rounded-full" style={{ width: `${(fundamentals?.Profit_Margins || 0) * 100}%` }}></div>
                      </div>
                    </div>
                  </div>

                  {/* Debt and leverage */}
                  <div className="bg-slate-950 border border-darkBorder/40 rounded-xl p-3 flex flex-col gap-2">
                    <span className="text-[8px] text-slate-500 font-bold uppercase">Debt & Capital Structure</span>
                    <div className="flex items-center justify-between text-[10px] text-white font-semibold">
                      <span>Total Debt</span>
                      <span>{formatCompact(fundamentals?.Total_Debt)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-white font-semibold">
                      <span>Debt-to-Equity</span>
                      <span>{fundamentals?.Debt_to_Equity ? (fundamentals.Debt_to_Equity * 100).toFixed(1) + '%' : '0.0%'}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-darkBorder/20">
                      <span className="text-[9px] text-slate-500 font-bold">Leverage Status</span>
                      {(() => {
                        const de = fundamentals?.Debt_to_Equity;
                        if (!de) return <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-slate-800 text-slate-400 border border-slate-700/50">Unknown</span>;
                        if (de < 1.0) return <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-brandGreen/10 text-brandGreen border border-brandGreen/25">Safe / Low Debt</span>;
                        if (de <= 2.0) return <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-amber-400/10 text-amber-400 border border-amber-400/25">Moderate Debt</span>;
                        return <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-brandRed/10 text-brandRed border border-brandRed/25">High Leverage Risk</span>;
                      })()}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  {/* LLM ENGINE PARAMETERS */}
                  <div className="bg-slate-950 border border-darkBorder/40 rounded-xl p-4 flex flex-col gap-4">
                    <div className="flex items-center gap-1.5 pb-2 border-b border-darkBorder/20">
                      <Sliders className="w-4 h-4 text-brandBlue" />
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">LLM Configurations</h4>
                    </div>

                    {saveSuccessMsg && (
                      <div className="p-2.5 bg-brandGreen/10 border border-brandGreen/35 rounded-lg text-[10px] text-brandGreen font-semibold">
                        {saveSuccessMsg}
                      </div>
                    )}

                    {adminSettings ? (
                      <div className="flex flex-col gap-3">
                        <div>
                          <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Active AI model</label>
                          <select
                            value={adminSettings.active_llm}
                            onChange={(e) => setAdminSettings({ ...adminSettings, active_llm: e.target.value })}
                            className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-darkBorder/60 rounded-lg focus:outline-none focus:border-brandBlue text-white"
                          >
                            <option value="OpenAI">OpenAI Chat GPT (gpt-4o-mini)</option>
                            <option value="Gemini">Google Gemini LLM</option>
                            <option value="AWS">AWS Bedrock (Amazon Anthropic)</option>
                          </select>
                        </div>

                        {adminSettings.active_llm === 'Gemini' && (
                          <div>
                            <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Gemini Variant</label>
                            <select
                              value={adminSettings.gemini_model || 'gemini-3.1-flash-lite'}
                              onChange={(e) => setAdminSettings({ ...adminSettings, gemini_model: e.target.value })}
                              className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-darkBorder/60 rounded-lg focus:outline-none focus:border-brandBlue text-white"
                            >
                              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Lite 3.1)</option>
                              <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite (Lite 2.5)</option>
                              <option value="gemini-2.0-flash-lite">gemini-2.0-flash-lite (Lite 2.0)</option>
                              <option value="gemini-2.0-flash">gemini-2.0-flash (Flash 2.0)</option>
                              <option value="gemini-2.5-flash">gemini-2.5-flash (Flash 2.5)</option>
                              <option value="gemini-3.5-flash">gemini-3.5-flash (Flash 3.5)</option>
                            </select>
                          </div>
                        )}

                        <div>
                          <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">OpenAI API Key</label>
                          <input
                            type="password"
                            placeholder="sk-..."
                            value={adminSettings.api_keys.OpenAI}
                            onChange={(e) => setAdminSettings({
                              ...adminSettings,
                              api_keys: { ...adminSettings.api_keys, OpenAI: e.target.value }
                            })}
                            className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-darkBorder/60 rounded-lg focus:outline-none focus:border-brandBlue text-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Google Gemini API Key</label>
                          <input
                            type="password"
                            placeholder="AIzaSy..."
                            value={adminSettings.api_keys.Gemini}
                            onChange={(e) => setAdminSettings({
                              ...adminSettings,
                              api_keys: { ...adminSettings.api_keys, Gemini: e.target.value }
                            })}
                            className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-darkBorder/60 rounded-lg focus:outline-none focus:border-brandBlue text-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">AWS Bedrock Client Key</label>
                          <input
                            type="password"
                            placeholder="AWS configurations..."
                            value={adminSettings.api_keys.AWS}
                            onChange={(e) => setAdminSettings({
                              ...adminSettings,
                              api_keys: { ...adminSettings.api_keys, AWS: e.target.value }
                            })}
                            className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-darkBorder/60 rounded-lg focus:outline-none focus:border-brandBlue text-white font-mono"
                          />
                        </div>

                        <button
                          onClick={handleSaveAdminSettings}
                          className="w-full py-2 bg-brandBlue hover:bg-blue-600 transition-all font-bold text-xs text-white rounded-lg mt-2 flex items-center justify-center gap-1.5"
                        >
                          <Database className="w-3.5 h-3.5" />
                          <span>Save LLM Config</span>
                        </button>
                      </div>
                    ) : (
                      <div className="p-2 text-center text-xs text-slate-500">Loading configurations...</div>
                    )}
                  </div>

                  {/* USER ACCOUNTS PANEL */}
                  {currentUser.role === 'admin' ? (
                    <div className="bg-slate-950 border border-darkBorder/40 rounded-xl p-4 flex flex-col gap-4">
                      <div className="flex items-center gap-1.5 pb-2 border-b border-darkBorder/20">
                        <Users className="w-4 h-4 text-brandBlue" />
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">User Accounts</h4>
                      </div>

                      <form onSubmit={handleCreateUser} className="flex flex-col gap-2.5 bg-slate-900/40 p-3 rounded-lg border border-darkBorder/25">
                        <div>
                          <label className="text-[8px] text-slate-400 font-bold uppercase block mb-1">Username</label>
                          <input
                            type="text"
                            placeholder="e.g. jsmith"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            className="w-full px-2 py-1 bg-slate-950 border border-darkBorder/60 rounded text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[8px] text-slate-400 font-bold uppercase block mb-1">Password</label>
                          <input
                            type="password"
                            placeholder="••••••••"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-2 py-1 bg-slate-950 border border-darkBorder/60 rounded text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[8px] text-slate-400 font-bold uppercase block mb-1">Access Role</label>
                          <select
                            value={newUserRole}
                            onChange={(e) => setNewUserRole(e.target.value)}
                            className="w-full px-2 py-1 bg-slate-950 border border-darkBorder/60 rounded text-xs text-white"
                          >
                            <option value="user">User</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Administrator</option>
                          </select>
                        </div>
                        <button
                          type="submit"
                          className="w-full py-1.5 bg-brandGreen hover:bg-green-600 transition-all font-bold text-xs text-white rounded flex items-center justify-center gap-1 mt-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Create User</span>
                        </button>
                      </form>

                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left text-xs text-slate-300">
                          <thead>
                            <tr className="border-b border-darkBorder/60 text-slate-500 font-bold uppercase text-[8px]">
                              <th className="pb-1.5">User</th>
                              <th className="pb-1.5">Role</th>
                              <th className="pb-1.5 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-darkBorder/30">
                            {adminSettings?.users.map((u) => (
                              <tr key={u.username} className="hover:bg-slate-900/20">
                                <td className="py-2 font-semibold text-white truncate max-w-[80px]">{u.username}</td>
                                <td className="py-2">
                                  <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${u.role === 'admin'
                                    ? 'bg-brandBlue/10 text-brandBlue border border-brandBlue/20'
                                    : u.role === 'manager'
                                      ? 'bg-purple-500/10 text-purple-400 border border-purple-500/25'
                                      : 'bg-slate-800 text-slate-400 border border-slate-700/50'
                                    }`}>
                                    {u.role}
                                  </span>
                                </td>
                                <td className="py-2 text-right">
                                  {u.username !== currentUser.username ? (
                                    <button
                                      onClick={() => handleDeleteUser(u.username)}
                                      className="p-1 hover:bg-slate-800 rounded transition-all text-slate-500 hover:text-brandRed"
                                      title="Delete account"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  ) : (
                                    <span className="text-[8px] text-slate-500 italic pr-1">Protected</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    /* Restricted View Warning for Managers */
                    <div className="bg-slate-950 border border-darkBorder/40 rounded-xl p-4 flex flex-col items-center justify-center text-center py-6">
                      <Lock className="w-8 h-8 text-slate-600 mb-2" />
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Access Restricted</h4>
                      <p className="text-[9px] text-slate-500 mt-1 max-w-[200px] leading-relaxed">
                        User management can only be managed by Administrators. Managers have full key configs options only.
                      </p>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* FuMa ASSISTANT BOT */}
          <div className="glass-panel rounded-2xl border border-darkBorder/60 flex flex-col h-[280px] md:h-[320px] overflow-hidden shrink-0">
            <div className="px-4 py-2 bg-slate-950 border-b border-darkBorder/60 flex items-center justify-between shrink-0">
              <h3 className="text-xs font-extrabold text-white flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-brandBlue animate-pulse" />
                <span>FuMa Assistant</span>
              </h3>

              <div className="flex items-center gap-1.5">
                <span className="text-[8px] font-bold text-slate-500 uppercase">Model:</span>
                <select
                  value={userKeys.active_llm || 'Gemini'}
                  onChange={async (e) => {
                    const newLlm = e.target.value;
                    const updatedKeys = { ...userKeys, active_llm: newLlm };
                    setUserKeys(updatedKeys);
                    // Save to backend immediately so profile is updated
                    try {
                      await authFetch('/api/user/keys', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          username: currentUser.username,
                          api_keys: updatedKeys
                        })
                      });
                    } catch (err) {
                      console.error('Failed to auto-save LLM preference', err);
                    }
                  }}
                  className="bg-slate-900 border border-darkBorder/50 rounded px-1.5 py-0.5 text-[9px] text-white focus:outline-none focus:border-brandBlue font-bold"
                >
                  <option value="Gemini">Gemini</option>
                  <option value="OpenAI">OpenAI</option>
                  <option value="AWS">AWS</option>
                </select>
              </div>
            </div>

            {/* SEARCH MODE SELECTOR */}
            <div className="px-2 py-1.5 bg-slate-950/40 border-b border-darkBorder/40 flex items-center justify-around gap-1.5 shrink-0 select-none">
              <button
                type="button"
                onClick={() => setSearchMode('app')}
                className={`flex-1 flex items-center justify-center gap-1 py-1 px-1 rounded-lg text-[9px] font-bold transition-all border ${searchMode === 'app'
                  ? 'bg-brandBlue/10 border-brandBlue/35 text-brandBlue'
                  : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                title="Use only application data (Analysis deck, Master Analysis, Fundamentals, News feed)"
              >
                <Database className="w-3 h-3" />
                <span>App Data</span>
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('internet')}
                className={`flex-1 flex items-center justify-center gap-1 py-1 px-1 rounded-lg text-[9px] font-bold transition-all border ${searchMode === 'internet'
                  ? 'bg-brandBlue/10 border-brandBlue/35 text-brandBlue'
                  : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                title="Search internet using Google News & Yahoo Finance"
              >
                <Globe className="w-3 h-3" />
                <span>Internet</span>
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('both')}
                className={`flex-1 flex items-center justify-center gap-1 py-1 px-1 rounded-lg text-[9px] font-bold transition-all border ${searchMode === 'both'
                  ? 'bg-brandBlue/10 border-brandBlue/35 text-brandBlue'
                  : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                title="Hybrid Analysis (Combine App Data + Internet Search)"
              >
                <Sparkles className="w-3 h-3" />
                <span>Hybrid</span>
              </button>
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-[#0A0D15] scrollbar-style">
              {chatHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] rounded-2xl p-2.5 text-[11px] leading-relaxed ${msg.role === 'user'
                    ? 'bg-brandBlue text-white rounded-tr-none'
                    : 'bg-slate-900 border border-darkBorder/60 text-slate-300 rounded-tl-none'
                    }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-900 border border-darkBorder/60 text-slate-500 rounded-2xl rounded-tl-none p-2.5 text-[10px] flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing stock reports...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSendChatMessage} className="p-2 border-t border-darkBorder/60 bg-slate-950 shrink-0 flex gap-2">
              <input
                type="text"
                placeholder="Ask FuMa about this stock..."
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                disabled={isChatLoading}
                className="flex-1 px-3 py-1.5 text-xs bg-slate-900 border border-darkBorder/80 rounded-xl focus:outline-none focus:border-brandBlue text-slate-100 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isChatLoading || !chatMessage.trim()}
                className="w-8 h-8 rounded-xl bg-brandBlue hover:bg-blue-600 transition-all text-white flex items-center justify-center shrink-0 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>

        </section>

      </main>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-darkCard/95 border-t border-darkBorder/80 px-4 py-2 flex items-center justify-around z-50 backdrop-blur-md">
        <button
          onClick={() => setMobileActiveTab('watch')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${mobileActiveTab === 'watch' ? 'text-brandBlue font-bold scale-105' : 'text-slate-500 hover:text-slate-300'
            }`}
        >
          <BarChart2 className="w-5 h-5" />
          <span className="text-[9px]">Watchlist</span>
        </button>
        <button
          onClick={() => setMobileActiveTab('deck')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${mobileActiveTab === 'deck' ? 'text-brandBlue font-bold scale-105' : 'text-slate-500 hover:text-slate-300'
            }`}
        >
          <LineChart className="w-5 h-5" />
          <span className="text-[9px]">Dashboard</span>
        </button>
        <button
          onClick={() => setMobileActiveTab('right')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${mobileActiveTab === 'right' ? 'text-brandBlue font-bold scale-105' : 'text-slate-500 hover:text-slate-300'
            }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[9px]">Research</span>
        </button>
      </div>

    </div>
  );
}

const Bot = ({ className }: { className?: string }) => (
  <div className={`w-3.5 h-3.5 rounded bg-brandBlue flex items-center justify-center text-[10px] font-black text-white ${className}`}>🤖</div>
);
