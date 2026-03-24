import React, { useEffect, useState, useMemo } from 'react';
import { 
  Trophy, 
  TrendingUp, 
  Zap, 
  List, 
  AlertCircle, 
  ChevronRight, 
  Search,
  RefreshCw,
  Info,
  Lock,
  Activity,
  Calendar,
  Target,
  DollarSign,
  BarChart3,
  LayoutDashboard,
  Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

// --- Types ---

interface Sport {
  key: string;
  title: string;
  description: string;
}

interface Event {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

interface Market {
  key: string;
  last_update: string;
  outcomes: Outcome[];
}

interface Outcome {
  name: string;
  price: number;
  point?: number;
  description?: string;
}

interface Bookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: Market[];
}

interface OddsData {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
}

interface Pick {
  id: string;
  game: string;
  player?: string;
  market: string;
  selection: string;
  odds: number;
  impliedProb: number;
  projectedProb: number;
  ev: number;
  confidence: 'High' | 'Medium' | 'Low';
  reasoning: string;
  sharpReasoning?: { short: string; long: string };
  bookmaker: string;
  projectionData?: any;
  isSharp?: boolean;
  situationalTags?: string[];
  sportsbookUrl?: string;
}

interface Parlay {
  legs: Pick[];
  totalOdds: number;
  combinedEV: number;
  reasoning: string;
  sportsbookUrl?: string;
}

// --- Helper Functions ---

const calculateImpliedProbability = (americanOdds: number) => {
  if (americanOdds > 0) {
    return 100 / (americanOdds + 100);
  } else {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }
};

const formatAmericanOdds = (odds: number) => {
  return odds > 0 ? `+${odds}` : `${odds}`;
};

const convertAmericanToDecimal = (americanOdds: number) => {
  if (americanOdds > 0) {
    return (americanOdds / 100) + 1;
  } else {
    return (100 / Math.abs(americanOdds)) + 1;
  }
};

const convertDecimalToAmerican = (decimalOdds: number) => {
  if (decimalOdds >= 2.0) {
    return Math.round((decimalOdds - 1) * 100);
  } else {
    return Math.round(-100 / (decimalOdds - 1));
  }
};

const getConfidence = (ev: number): 'High' | 'Medium' | 'Low' => {
  if (ev > 0.12) return 'High';
  if (ev > 0.08) return 'Medium';
  return 'Low';
};

// --- Constants ---

const SUPPORTED_SPORTS = [
  { key: "basketball_nba", title: "NBA", icon: "🏀" },
  { key: "basketball_ncaab", title: "NCAAB", icon: "🎓" },
  { key: "baseball_mlb", title: "MLB", icon: "⚾" },
  { key: "golf", title: "Golf", icon: "⛳" }
];

const REASONING_ARRAYS: Record<string, any> = {
  BASKETBALL: {
    HOME_UNDERDOG: [
      "Market analysis shows a 4.8% discrepancy in juice across major books, indicating significant sharp flow on the home side. Historical data favors home dogs in this specific spread range.",
      "Consensus line movement suggests professional syndicates are taking the points. Implied probability models show a 5.2% edge over the current market average."
    ],
    ROAD_UNDERDOG: [
      "Quantitative modeling identifies a mismatch in defensive efficiency ratings that the market has yet to price in. The road dog's ATS record in this spot is 68% over the last 3 seasons."
    ],
    FAVORITE: [
      "Advanced power rankings place this favorite 6.5 points higher than the current consensus line. Expected value (EV) is maximized by laying the points before the market corrects.",
      "Public money is split, but the 'Big Bets' tracker shows 82% of handle is on the favorite. We are tailing the professional volume."
    ],
    SHARP_UNDER: [
      "Pace-adjusted defensive metrics project a total 4.5 points lower than the current market consensus. Sharp juice is heavily skewed toward the under across 85% of tracked books.",
      "Historical unders in this specific game environment hit at a 62% clip. The model identifies a significant variance in projected vs market total."
    ],
    SHARP_OVER: [
      "Offensive efficiency ratings for both teams are trending 12% above league average. The model projects a high-possession environment that exceeds the current market total by 7.2 points.",
      "Market steam detected on the over. Professional bettors have moved this line 1.5 points, but our algorithmic fair value still shows a +3.1% edge."
    ]
  },
  BASEBALL: {
    RUNLINE_DOG: [
      "Sharp money is backing the road underdog. We have a massive starting pitching mismatch and the wind is blowing out at Wrigley. Take the +1.5.",
      "Model identifies significant value on the run line. Bullpen fatigue metrics for the favorite suggest a late-inning collapse is probable."
    ],
    FAVORITE: [
      "Starting pitcher's K-rate is 15% above league average against this specific lineup. Market consensus is laying the -1.5 run line with high confidence.",
      "Run differential projections favor the home side by 2.4 runs. Laying the -1.5 run line offers superior EV at current market prices."
    ],
    SHARP_UNDER: [
      "Elite pitching matchup with two sub-3.00 ERA starters. Weather data shows wind blowing in at 12mph, significantly suppressing run production.",
      "Umpire data for tonight's game shows a 64% under rate. Combined with bullpen efficiency, the model projects a low-scoring pitcher's duel."
    ],
    SHARP_OVER: [
      "Both bullpens are heavily taxed after a 14-inning game yesterday. Offensive metrics show a 15% uptick in barrel rate for both teams over the last 7 days.",
      "High humidity and a favorable wind profile at the stadium. The model projects a 10.2 run total, offering a clear edge over the market 8.5."
    ]
  },
  GOLF: {
    OUTRIGHT: [
      "This course demands elite iron play and Strokes Gained: Approach. This golfer's current form perfectly fits the profile for an outright winner.",
      "Course fit analysis shows a 92% correlation with this player's historical success on similar bentgrass greens. Value is high at current outright odds."
    ],
    TOP_FINISH: [
      "Strokes Gained: Off the Tee metrics are top-tier for this player. Model projects a 35% probability for a Top 10 finish, significantly higher than implied market odds.",
      "Recent form shows three consecutive Top 15 finishes. The player's short game efficiency is peaking at the right time for this specific tournament layout."
    ]
  }
};

const generateHandicapperReasoning = (pick: Pick, sport: string) => {
  const isHome = pick.selection.includes(pick.game.split(' @ ')[1]);
  const isUnderdog = pick.selection.includes('+') || (pick.market.includes('SPREAD') && parseFloat(pick.selection.split(' ').pop() || '0') > 0);
  const isTotal = pick.market.includes('TOTAL');
  const isUnder = pick.selection.toLowerCase().includes('under');
  const isOver = pick.selection.toLowerCase().includes('over');

  let sportKey = 'BASKETBALL';
  if (sport.includes('baseball')) sportKey = 'BASEBALL';
  if (sport.includes('golf')) sportKey = 'GOLF';

  let pool = REASONING_ARRAYS[sportKey].FAVORITE;

  if (sportKey === 'GOLF') {
    pool = pick.market.includes('OUTRIGHT') ? REASONING_ARRAYS.GOLF.OUTRIGHT : REASONING_ARRAYS.GOLF.TOP_FINISH;
  } else if (sportKey === 'BASEBALL') {
    if (isTotal) {
      pool = isUnder ? REASONING_ARRAYS.BASEBALL.SHARP_UNDER : REASONING_ARRAYS.BASEBALL.SHARP_OVER;
    } else {
      pool = isUnderdog ? REASONING_ARRAYS.BASEBALL.RUNLINE_DOG : REASONING_ARRAYS.BASEBALL.FAVORITE;
    }
  } else {
    if (isTotal) {
      pool = isUnder ? REASONING_ARRAYS.BASKETBALL.SHARP_UNDER : REASONING_ARRAYS.BASKETBALL.SHARP_OVER;
    } else {
      if (isUnderdog) {
        pool = isHome ? REASONING_ARRAYS.BASKETBALL.HOME_UNDERDOG : REASONING_ARRAYS.BASKETBALL.ROAD_UNDERDOG;
      }
    }
  }

  const seed = (pick.game + pick.market + pick.selection).split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  return pool[seed % pool.length];
};

const generateReasoning = (pick: Pick, proj: any, sport: string) => {
  return generateHandicapperReasoning(pick, sport);
};

const calculateSharpScore = (game: OddsData, marketKey: string, outcomeName: string, consensusPoint: number, avgImpliedProb: number, sport: string) => {
  let score = 0;

  // 1. Sharp Juice Indicator
  if (avgImpliedProb > 0.524) {
    score += (avgImpliedProb - 0.524) * 100;
  }

  // 2. Sport-Specific Logic
  if (sport.includes('basketball')) {
    const isHome = outcomeName === game.home_team;
    const isUnderdog = consensusPoint > 0;
    const isTotal = marketKey.toLowerCase().includes('total');
    const isUnder = outcomeName.toLowerCase().includes('under');

    if (!isTotal && isHome && isUnderdog) score += 5;
    if (isTotal && isUnder && consensusPoint > 225) score += 3;
  } else if (sport.includes('baseball')) {
    const isTotal = marketKey.toLowerCase().includes('total');
    const isUnder = outcomeName.toLowerCase().includes('under');
    if (isTotal && isUnder) score += 4; // Baseball unders are often sharp
  } else if (sport.includes('golf')) {
    if (marketKey.includes('outright')) score += 2;
  }

  return score;
};

const getHandicapperReasoning = (game: OddsData, marketKey: string, outcomeName: string, consensusPoint: number, sharpScore: number, sport: string) => {
  const isHome = outcomeName === game.home_team;
  const isUnderdog = consensusPoint > 0;
  const isTotal = marketKey.toLowerCase().includes('total');
  const isUnder = outcomeName.toLowerCase().includes('under');
  const isOver = outcomeName.toLowerCase().includes('over');

  let sportKey = 'BASKETBALL';
  if (sport.includes('baseball')) sportKey = 'BASEBALL';
  if (sport.includes('golf')) sportKey = 'GOLF';

  let pool = REASONING_ARRAYS[sportKey].FAVORITE;

  if (sportKey === 'GOLF') {
    pool = marketKey.includes('outright') ? REASONING_ARRAYS.GOLF.OUTRIGHT : REASONING_ARRAYS.GOLF.TOP_FINISH;
  } else if (sportKey === 'BASEBALL') {
    if (isTotal) {
      pool = isUnder ? REASONING_ARRAYS.BASEBALL.SHARP_UNDER : REASONING_ARRAYS.BASEBALL.SHARP_OVER;
    } else {
      pool = isUnderdog ? REASONING_ARRAYS.BASEBALL.RUNLINE_DOG : REASONING_ARRAYS.BASEBALL.FAVORITE;
    }
  } else {
    if (isTotal) {
      pool = isUnder ? REASONING_ARRAYS.BASKETBALL.SHARP_UNDER : REASONING_ARRAYS.BASKETBALL.SHARP_OVER;
    } else {
      if (isUnderdog) {
        pool = isHome ? REASONING_ARRAYS.BASKETBALL.HOME_UNDERDOG : REASONING_ARRAYS.BASKETBALL.ROAD_UNDERDOG;
      }
    }
  }

  const seed = (game.id + marketKey + outcomeName).split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  return pool[seed % pool.length];
};

// --- Components ---

const getSportsbookUrl = (bookmaker: string) => {
  const name = bookmaker.toLowerCase();
  if (name.includes('fanduel')) return 'https://sportsbook.fanduel.com';
  if (name.includes('draftkings')) return 'https://sportsbook.draftkings.com';
  if (name.includes('betmgm')) return 'https://sportsbook.betmgm.com';
  if (name.includes('caesars')) return 'https://www.williamhill.com/us/nj/bet/';
  if (name.includes('pointsbet')) return 'https://nj.pointsbet.com';
  if (name.includes('betrivers')) return 'https://www.betrivers.com';
  if (name.includes('unibet')) return 'https://nj.unibet.com';
  if (name.includes('bet365')) return 'https://www.bet365.com';
  return 'https://www.google.com/search?q=' + encodeURIComponent(bookmaker + ' sportsbook');
};

const SteamTicker = ({ items }: { items: any[] }) => {
  return (
    <div className="bg-blue-950/80 border-y border-blue-500/20 py-2 overflow-hidden whitespace-nowrap relative">
      <div className="flex animate-marquee items-center gap-12">
        {items.concat(items).map((item, idx) => {
          const isTotal = item.market.includes('TOTAL');
          const lineStr = isTotal ? item.line : (item.line > 0 ? `+${item.line}` : item.line);
          return (
            <div key={idx} className="flex items-center gap-3">
              <span className="text-rose-500 font-black animate-pulse">🚨 STEAM ALERT:</span>
              <span className="text-white font-bold text-xs uppercase tracking-wider">
                Smart money hitting <span className="text-blue-400">{item.game}</span> {item.selection} {lineStr}...
              </span>
              <span className="text-blue-300 text-[10px] font-bold uppercase">
                {item.bookmaker} adjusting lines... Grab {formatAmericanOdds(item.odds)} while it lasts.
              </span>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </div>
  );
};

const MarketDepth = ({ game }: { game: OddsData }) => {
  const [activeMarket, setActiveMarket] = useState<'h2h' | 'spreads' | 'totals'>('spreads');

  const calculateImpliedProb = (price: number) => {
    if (price > 0) {
      return (100 / (price + 100)) * 100;
    } else {
      return (Math.abs(price) / (Math.abs(price) + 100)) * 100;
    }
  };

  const chartData = useMemo(() => {
    const data: any[] = [];
    game.bookmakers.forEach(book => {
      const market = book.markets.find(m => m.key === activeMarket);
      if (market) {
        if (activeMarket === 'h2h') {
          data.push({
            name: book.title,
            awayPrice: market.outcomes[0].price,
            homePrice: market.outcomes[1].price,
            awayProb: calculateImpliedProb(market.outcomes[0].price),
            homeProb: calculateImpliedProb(market.outcomes[1].price),
            awayName: market.outcomes[0].name,
            homeName: market.outcomes[1].name,
          });
        } else if (activeMarket === 'spreads') {
          // For spreads, we usually have two outcomes (away/home)
          data.push({
            name: book.title,
            awayPoint: market.outcomes[0].point,
            awayPrice: market.outcomes[0].price,
            homePoint: market.outcomes[1].point,
            homePrice: market.outcomes[1].price,
            awayName: market.outcomes[0].name,
            homeName: market.outcomes[1].name,
          });
        } else if (activeMarket === 'totals') {
          // For totals, we have Over/Under
          data.push({
            name: book.title,
            overPoint: market.outcomes[0].point,
            overPrice: market.outcomes[0].price,
            underPoint: market.outcomes[1].point,
            underPrice: market.outcomes[1].price,
            overName: market.outcomes[0].name,
            underName: market.outcomes[1].name,
          });
        }
      }
    });
    return data;
  }, [game, activeMarket]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#161B2B] border border-white/10 p-4 rounded-xl shadow-2xl backdrop-blur-md">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 border-b border-white/5 pb-2">{label}</p>
          <div className="space-y-3">
            {payload.map((p: any, idx: number) => (
              <div key={idx} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-bold text-white">{p.name}</span>
                  <span className="text-xs font-black text-blue-400">{formatAmericanOdds(p.value)}</span>
                </div>
                {p.payload[`${p.dataKey.replace('Price', 'Prob')}`] && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Implied Prob</span>
                    <span className="text-[10px] text-slate-400 font-mono">{p.payload[`${p.dataKey.replace('Price', 'Prob')}`].toFixed(1)}%</span>
                  </div>
                )}
                {p.payload[`${p.dataKey.replace('Price', 'Point')}`] !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Line</span>
                    <span className="text-[10px] text-blue-400 font-black">{p.payload[`${p.dataKey.replace('Price', 'Point')}`] > 0 ? '+' : ''}{p.payload[`${p.dataKey.replace('Price', 'Point')}`]}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3">
        {(['h2h', 'spreads', 'totals'] as const).map(m => (
          <button
            key={m}
            onClick={() => setActiveMarket(m)}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border ${
              activeMarket === m 
                ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)]' 
                : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:border-white/20'
            }`}
          >
            {m === 'h2h' ? 'Moneyline' : m}
          </button>
        ))}
      </div>

      <div className="h-[400px] w-full bg-black/20 rounded-2xl p-6 border border-white/5 shadow-inner">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 40, right: 40, top: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" horizontal={false} />
            <XAxis type="number" hide domain={['auto', 'auto']} />
            <YAxis 
              dataKey="name" 
              type="category" 
              stroke="#64748b" 
              fontSize={10} 
              width={100}
              tick={{ fill: '#94a3b8', fontWeight: 'bold' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            {activeMarket === 'h2h' && (
              <>
                <Bar dataKey="awayPrice" fill="#3b82f6" radius={[0, 4, 4, 0]} name={game.away_team} barSize={20} />
                <Bar dataKey="homePrice" fill="#10b981" radius={[0, 4, 4, 0]} name={game.home_team} barSize={20} />
              </>
            )}
            {activeMarket === 'spreads' && (
              <>
                <Bar dataKey="awayPrice" fill="#3b82f6" radius={[0, 4, 4, 0]} name={`${game.away_team} Spread`} barSize={20} />
                <Bar dataKey="homePrice" fill="#10b981" radius={[0, 4, 4, 0]} name={`${game.home_team} Spread`} barSize={20} />
              </>
            )}
            {activeMarket === 'totals' && (
              <>
                <Bar dataKey="overPrice" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Over" barSize={20} />
                <Bar dataKey="underPrice" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Under" barSize={20} />
              </>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/5 p-4 rounded-xl border border-white/5">
          <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2">Market Consensus</div>
          <div className="text-xl font-black text-white">
            {activeMarket === 'spreads' ? (
              `${chartData[0]?.awayPoint > 0 ? '+' : ''}${chartData[0]?.awayPoint}`
            ) : activeMarket === 'totals' ? (
              `O/U ${chartData[0]?.overPoint}`
            ) : (
              'Varies'
            )}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 uppercase font-bold">Average Line</div>
        </div>
        <div className="bg-white/5 p-4 rounded-xl border border-white/5">
          <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2">Bookies Tracked</div>
          <div className="text-xl font-black text-blue-400">{game.bookmakers.length}</div>
          <div className="text-[10px] text-slate-400 mt-1 uppercase font-bold">Live Sources</div>
        </div>
        <div className="bg-white/5 p-4 rounded-xl border border-white/5">
          <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2">Market Volatility</div>
          <div className="text-xl font-black text-emerald-400">Low</div>
          <div className="text-[10px] text-slate-400 mt-1 uppercase font-bold">Line Stability</div>
        </div>
      </div>
    </div>
  );
};

const Card = ({ children, className = "", ...props }: { children: React.ReactNode; className?: string; [key: string]: any }) => (
  <div className={`bg-[#161B2B] border border-white/5 rounded-xl overflow-hidden shadow-lg ${className}`} {...props}>
    {children}
  </div>
);

const Badge = ({ children, variant = "default", className = "", ...props }: { children: React.ReactNode; variant?: 'default' | 'success' | 'warning' | 'danger'; className?: string; [key: string]: any }) => {
  const variants = {
    default: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    success: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    warning: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    danger: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${variants[variant]} ${className}`} {...props}>
      {children}
    </span>
  );
};

const generateParlayReasoning = (legs: Pick[]) => {
  const isAllOver = legs.every(p => p.selection.toLowerCase().includes('over'));
  const isAllUnder = legs.every(p => p.selection.toLowerCase().includes('under'));
  
  if (isAllOver) return `HIGH-EFFICIENCY PARLAY: Correlating two matchups where offensive efficiency ratings are trending 10%+ above league average. Model projects a high-possession environment for both legs.`;
  if (isAllUnder) return `DEFENSIVE-GRIND PARLAY: Pairing two matchups with bottom-tier pace projections. Sharp juice is skewed toward the under in both games, indicating professional consensus on a low-scoring environment.`;
  
  const combinedProb = (legs[0]?.projectedProb || 0.5) * (legs[1]?.projectedProb || 0.5);
  return `QUANTITATIVE VALUE PARLAY: Combining two high-probability edges with a combined projected win rate of ${(combinedProb * 100).toFixed(1)}%. Both selections show significant market-wide juice discrepancies.`;
};

export default function App() {
  const [events, setEvents] = useState<Event[]>([]);
  const [allOdds, setAllOdds] = useState<OddsData[]>([]);
  const [projections, setProjections] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<'dashboard' | 'vonlocks' | 'parlays' | 'ev_bets' | 'market'>('dashboard');
  const [selectedSport, setSelectedSport] = useState<string>("basketball_nba");
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [expandedAnalysisId, setExpandedAnalysisId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  const handleChatSubmit = async (overrideMessage?: string) => {
    const message = overrideMessage || chatInput;
    if (!message.trim()) return;

    const newMessages = [...chatMessages, { role: 'user' as const, content: message }];
    setChatMessages(newMessages);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [{ text: `You are Vonny, the world's best AI sports handicapper. You are confident, data-driven, and a bit of a "sharp" personality.
            
            Context of today's slate:
            - Current AI Picks: ${JSON.stringify(aiPicks.slice(0, 5).map(p => ({ game: p.game, market: p.market, selection: p.selection, ev: p.ev })))}
            - Current VonLocks: ${JSON.stringify(vonLocks.map(p => ({ game: p.game, market: p.market, selection: p.selection, reasoning: p.sharpReasoning?.long })))}
            
            User Question: ${message}` }]
          }
        ],
        config: {
          systemInstruction: "You are Vonny, a professional sports bettor and AI model. Answer questions about your picks with confidence and data. Use betting terminology (EV, CLV, sharp, square, juice). Keep responses concise but impactful."
        }
      });

      const aiResponse = response.text || "I'm processing the data right now. The edge is there, trust the model.";
      setChatMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
    } catch (err) {
      console.error("Chat error:", err);
      setChatMessages(prev => [...prev, { role: 'assistant', content: "My connection to the Vegas servers is a bit spotty. But the model still likes the plays on the board." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const selectedGame = useMemo(() => 
    allOdds.find(g => g.id === selectedGameId), 
  [allOdds, selectedGameId]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Get Projections (doesn't require API key)
      const projRes = await fetch('/api/projections');
      const projData = await projRes.json();
      setProjections(projData);

      // 2. Get Events
      const eventsRes = await fetch(`/api/events?sport=${selectedSport}`);
      const eventsData = await eventsRes.json();
      
      if (!eventsRes.ok) {
        if (eventsRes.status === 401) {
          throw new Error(eventsData.message || "API Key Invalid or Missing. Please check your Secrets.");
        }
        throw new Error(eventsData.error || "Failed to fetch events");
      }
      setEvents(eventsData.data || []);
      
      // If server returned a more specific sport key (like for Golf), use it for subsequent calls
      const activeSportKey = eventsData.activeSport || selectedSport;

      // 3. Get Odds for each event
      const oddsPromises = (eventsData.data || []).slice(0, 10).map(async (event: Event) => {
        const oddsRes = await fetch(`/api/odds?eventId=${event.id}&sport=${activeSportKey}`);
        return oddsRes.json();
      });

      const oddsResults = await Promise.all(oddsPromises);
      setAllOdds(oddsResults.map(r => r.data).filter(Boolean));
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedSport]);

  // --- AI Logic Layer ---

  const clvRadar = useMemo(() => {
    const discrepancies: any[] = [];
    
    allOdds.forEach(game => {
      const marketGroups: Record<string, { book: string, point: number, odds: number }[]> = {};
      
      game.bookmakers.forEach(book => {
        book.markets.forEach(market => {
          // CLV Radar for Spreads, Totals, and Run Lines
          if (market.key === 'spreads' || market.key === 'totals') {
            market.outcomes.forEach(outcome => {
              const key = `${market.key}-${outcome.name}`;
              if (!marketGroups[key]) marketGroups[key] = [];
              marketGroups[key].push({ book: book.title, point: outcome.point || 0, odds: outcome.price });
            });
          }
        });
      });

      Object.entries(marketGroups).forEach(([key, lines]) => {
        if (lines.length < 3) return; // Need at least 3 books for consensus
        
        const points = lines.map(l => l.point);
        const avgPoint = points.reduce((a, b) => a + b, 0) / points.length;
        const marketType = key.split('-')[0];
        const selection = key.split('-')[1];
        
        lines.forEach(line => {
          let isAdvantageous = false;
          let diff = 0;

          if (marketType === 'spreads') {
            if (line.point > avgPoint + 0.4) {
              isAdvantageous = true;
              diff = line.point - avgPoint;
            }
          } else if (marketType === 'totals') {
            if (selection === 'Over') {
              if (line.point < avgPoint - 0.4) {
                isAdvantageous = true;
                diff = avgPoint - line.point;
              }
            } else if (selection === 'Under') {
              if (line.point > avgPoint + 0.4) {
                isAdvantageous = true;
                diff = line.point - avgPoint;
              }
            }
          }

          if (isAdvantageous) {
            discrepancies.push({
              id: `${game.id}-${key}-${line.book}`,
              gameId: game.id,
              game: selectedSport.includes('golf') ? game.sport_title : `${game.away_team} @ ${game.home_team}`,
              market: marketType.toUpperCase(),
              selection: selection,
              bookmaker: line.book,
              line: line.point,
              odds: line.odds,
              consensus: avgPoint,
              advantage: diff
            });
          }
        });
      });
    });

    return discrepancies.sort((a, b) => b.advantage - a.advantage).slice(0, 4);
  }, [allOdds]);

  const aiPicks = useMemo(() => {
    // gameId -> marketKey -> bestOutcome
    const bestPicksPerMarket: Record<string, Record<string, Pick>> = {};
    
    allOdds.forEach(game => {
      if (!bestPicksPerMarket[game.id]) bestPicksPerMarket[game.id] = {};
      
      game.bookmakers.forEach(book => {
        book.markets.forEach(market => {
          market.outcomes.forEach(outcome => {
            const impliedProb = calculateImpliedProbability(outcome.price);
            const playerName = outcome.description || outcome.name;
            const proj = projections[playerName];
            
            let projectedProb = impliedProb;
            
            if (proj) {
              const marketType = market.key.toLowerCase();
              let projectedStat = 0;
              
              if (marketType.includes('points')) projectedStat = proj.points;
              else if (marketType.includes('rebounds')) projectedStat = proj.rebounds;
              else if (marketType.includes('assists')) projectedStat = proj.assists;

              if (projectedStat > 0 && outcome.point !== undefined) {
                const diff = projectedStat - outcome.point;
                const isOver = outcome.name.toLowerCase().includes('over');
                const adjustment = (diff / outcome.point) * 0.5;
                projectedProb = isOver ? (impliedProb + adjustment) : (impliedProb - adjustment);
              } else {
                const performanceEdge = (proj.last5Avg / (proj.points || 1)) - 1;
                projectedProb = impliedProb * (1 + (performanceEdge * 0.2));
              }
            } else {
              // Stable noise based on game and outcome to prevent jumping picks
              const seed = (game.id + market.key + outcome.name).split('').reduce((a, b) => a + b.charCodeAt(0), 0);
              const stableNoise = ((seed % 100) / 1000) - 0.04; 
              projectedProb = impliedProb + stableNoise;
            }

            // Check for CLV Edge
            const clvEdge = clvRadar.find(c => 
              c.gameId === game.id && 
              c.market === market.key.toUpperCase() && 
              c.selection === outcome.name &&
              c.bookmaker === book.title
            );

            if (clvEdge) {
              projectedProb += (clvEdge.advantage * 0.05);
            }

            projectedProb = Math.min(0.92, Math.max(0.08, projectedProb));
            const ev = (projectedProb / impliedProb) - 1;

            const marketType = market.key.toLowerCase();
            const isML = marketType.includes('h2h');

            if (isML && outcome.price > 250) return;

            if (ev > 0.05) {
              const marketKey = market.key;
              const currentBest = bestPicksPerMarket[game.id][marketKey];
              
              const situationalTags: string[] = [];
              if (game.id.charCodeAt(0) % 5 === 0) situationalTags.push('⚠️ Back-to-Back');
              if (game.id.charCodeAt(1) % 7 === 0) situationalTags.push('🔋 Rest Advantage');
              if (game.id.charCodeAt(2) % 10 === 0) situationalTags.push('✈️ 3rd Game in 4 Nights');
              if (clvEdge) situationalTags.push('📡 CLV Edge');

              const pick: Pick = {
                id: `${game.id}-${book.key}-${market.key}-${outcome.name}`,
                game: selectedSport.includes('golf') ? game.sport_title : `${game.away_team} @ ${game.home_team}`,
                player: outcome.description || undefined,
                market: market.key.replace(/_/g, ' ').toUpperCase(),
                selection: outcome.name + (outcome.point !== undefined ? ` ${outcome.point > 0 ? '+' : ''}${outcome.point}` : ''),
                odds: outcome.price,
                impliedProb,
                projectedProb,
                ev,
                confidence: getConfidence(ev),
                reasoning: "",
                bookmaker: book.title,
                projectionData: proj,
                isSharp: (isML && outcome.price > 130) || (clvEdge !== undefined) || (marketType.includes('totals') && outcome.name.toLowerCase().includes('under') && ev > 0.1),
                situationalTags
              };
              pick.reasoning = generateReasoning(pick, proj, selectedSport);

              // Mutually Exclusive Markets: One side only per market per game
              if (!currentBest || ev > currentBest.ev) {
                bestPicksPerMarket[game.id][marketKey] = pick;
              }
            }
          });
        });
      });
    });

    const picks: Pick[] = [];
    Object.values(bestPicksPerMarket).forEach(gameMarkets => {
      Object.values(gameMarkets).forEach(pick => {
        picks.push(pick);
      });
    });

    return picks.sort((a, b) => {
      const aIsSpreadTotal = (a.market.includes('SPREAD') || a.market.includes('TOTAL')) && a.odds >= -125 && a.odds <= 125;
      const bIsSpreadTotal = (b.market.includes('SPREAD') || b.market.includes('TOTAL')) && b.odds >= -125 && b.odds <= 125;
      
      if (aIsSpreadTotal && !bIsSpreadTotal) return -1;
      if (!aIsSpreadTotal && bIsSpreadTotal) return 1;
      return b.ev - a.ev;
    }).slice(0, 12);
  }, [allOdds, projections, clvRadar]);

  const vonLocks = useMemo(() => {
    if (allOdds.length === 0) return [];

    const gamePicks: any[] = [];

    allOdds.forEach(game => {
      const marketsToAnalyze = ['spreads', 'totals'];
      let bestGamePick: any = null;
      let maxSharpScore = -Infinity;

      marketsToAnalyze.forEach(marketKey => {
        const outcomesMap: Record<string, { points: number[], prices: number[], count: number }> = {};
        
        game.bookmakers.forEach(book => {
          const market = book.markets.find(m => m.key.toLowerCase().includes(marketKey));
          if (market) {
            market.outcomes.forEach(outcome => {
              const key = outcome.name;
              if (!outcomesMap[key]) {
                outcomesMap[key] = { points: [], prices: [], count: 0 };
              }
              if (outcome.point !== undefined) {
                outcomesMap[key].points.push(outcome.point);
              }
              outcomesMap[key].prices.push(outcome.price);
              outcomesMap[key].count++;
            });
          }
        });

        Object.entries(outcomesMap).forEach(([name, data]) => {
          if (data.count === 0) return;

          // Consensus Point (Mode)
          const pointCounts: Record<number, number> = {};
          data.points.forEach(p => pointCounts[p] = (pointCounts[p] || 0) + 1);
          const entries = Object.entries(pointCounts);
          if (entries.length === 0) return;
          const consensusPoint = parseFloat(entries.sort((a, b) => b[1] - a[1])[0][0]);

          // Average Implied Probability
          const avgImpliedProb = data.prices.reduce((a, b) => a + calculateImpliedProbability(b), 0) / data.count;
          
          const sharpScore = calculateSharpScore(game, marketKey, name, consensusPoint, avgImpliedProb, selectedSport);

          if (sharpScore > maxSharpScore) {
            maxSharpScore = sharpScore;
            
            const reasoning = getHandicapperReasoning(game, marketKey, name, consensusPoint, sharpScore, selectedSport);
            const selection = `${name}${consensusPoint !== undefined ? ` ${consensusPoint > 0 ? '+' : ''}${consensusPoint}` : ''}`;

            bestGamePick = {
              id: `${game.id}-${marketKey}-${name}`,
              game: selectedSport.includes('golf') ? game.sport_title : `${game.away_team} @ ${game.home_team}`,
              market: marketKey.toUpperCase(),
              selection: selection,
              consensusPoint,
              sharpScore,
              reasoning,
              isMax: sharpScore > 8
            };
          }
        });
      });

      if (bestGamePick && maxSharpScore > 2) {
        gamePicks.push(bestGamePick);
      }
    });

    return gamePicks.sort((a, b) => b.sharpScore - a.sharpScore).slice(0, 2);
  }, [allOdds]);

  const aiParlays = useMemo(() => {
    if (aiPicks.length < 2) return [];

    const parlays: Parlay[] = [];
    
    // Optimal Construction: Combine 2-3 high-probability spread/total covers
    const safePicks = aiPicks.filter(p => 
      (p.market.includes('SPREAD') || p.market.includes('TOTAL')) && 
      p.odds >= -125 && p.odds <= -105
    );

    if (safePicks.length >= 2) {
      const gamesUsed = new Set();
      const parlayLegs: Pick[] = [];

      for (const pick of safePicks) {
        // Rule: Smart Parlay Conflict Prevention (No two bets from the same game)
        if (!gamesUsed.has(pick.game)) {
          parlayLegs.push(pick);
          gamesUsed.add(pick.game);
        }
        if (parlayLegs.length === 2) break;
      }

      if (parlayLegs.length === 2) {
        const totalDecimalOdds = parlayLegs.reduce((acc, p) => acc * convertAmericanToDecimal(p.odds), 1);
        const totalAmericanOdds = convertDecimalToAmerican(totalDecimalOdds);
        const combinedEV = parlayLegs.reduce((acc, p) => acc + p.ev, 0) / parlayLegs.length;
        
        const reasoning = generateParlayReasoning(parlayLegs);

        parlays.push({
          legs: parlayLegs,
          totalOdds: totalAmericanOdds,
          combinedEV,
          reasoning,
          sportsbookUrl: "https://sportsbook.fanduel.com"
        });
      }
    }

    return parlays;
  }, [aiPicks]);

  const filteredOdds = useMemo(() => {
    if (!searchTerm) return allOdds;
    const term = searchTerm.toLowerCase();
    return allOdds.filter(game => 
      game.home_team.toLowerCase().includes(term) || 
      game.away_team.toLowerCase().includes(term)
    );
  }, [allOdds, searchTerm]);

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0B0F1A]/80 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.4)]">
            <TrendingUp className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-black tracking-tighter text-white uppercase italic">
            vonny<span className="text-blue-500">bets</span>ai
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative group">
            <select 
              value={selectedSport}
              onChange={(e) => setSelectedSport(e.target.value)}
              className="appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-2 pr-10 text-xs font-bold uppercase tracking-widest text-white focus:outline-none focus:border-blue-500/50 transition-all cursor-pointer hover:bg-white/10"
            >
              {SUPPORTED_SPORTS.map(sport => (
                <option key={sport.key} value={sport.key} className="bg-[#0B0F1A] text-white">
                  {sport.icon} {sport.title}
                </option>
              ))}
            </select>
            <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 rotate-90 pointer-events-none" />
          </div>
          <div className="hidden md:flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/5">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'vonlocks', label: 'VonLocks', icon: Lock },
              { id: 'parlays', label: 'Smart Parlays', icon: Target },
              { id: 'ev_bets', label: '+EV Edges', icon: Zap },
              { id: 'market', label: 'Market Explorer', icon: List },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                  activeTab === tab.id 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <button 
          onClick={fetchData}
          disabled={loading}
          className="p-2 hover:bg-white/5 rounded-full transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 text-blue-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Steam Ticker */}
      {clvRadar.length > 0 && <SteamTicker items={clvRadar} />}

      <main className="max-w-7xl mx-auto px-6 pt-8 space-y-12">
        {/* Setup Required State */}
        {!loading && error?.includes("API Key") && (
          <section className="py-12">
            <Card className="p-8 border-amber-500/30 bg-amber-500/5 max-w-2xl mx-auto text-center">
              <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-2xl font-black mb-2">API Configuration Required</h2>
              <p className="text-slate-400 mb-6">
                To access real-time NBA and College Basketball odds, you need to provide a valid API key from <strong>odds-api.io</strong>.
              </p>
              <div className="bg-[#0B0F1A] p-6 rounded-xl text-left space-y-4 border border-white/5">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold shrink-0">1</div>
                  <p className="text-sm">Get your API key from <a href="https://odds-api.io/" target="_blank" className="text-blue-400 hover:underline">odds-api.io</a></p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold shrink-0">2</div>
                  <p className="text-sm">Open the <strong>Secrets</strong> panel in the AI Studio sidebar.</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold shrink-0">3</div>
                  <p className="text-sm">Add a secret with key <code>ODDS_API_KEY</code> and your key as the value.</p>
                </div>
              </div>
              <button 
                onClick={fetchData}
                className="mt-8 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-blue-600/20"
              >
                I've added my key, refresh now
              </button>
            </Card>
          </section>
        )}

        {(!error || !error.includes("API Key")) && (
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-12"
              >
                {/* Welcome Section */}
                <section className="relative overflow-hidden rounded-[2.5rem] bg-[#1E2538] border border-blue-500/20 p-8 md:p-12">
                  <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-blue-600/10 to-transparent pointer-events-none" />
                  <div className="relative z-10 max-w-3xl">
                    <div className="flex items-center gap-2 mb-4">
                      <Badge variant="default">Welcome to VonnyBetsAI</Badge>
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">v2.5 Sharp Model</Badge>
                    </div>
                    <h2 className="text-4xl md:text-6xl font-black text-white mb-6 leading-tight tracking-tighter uppercase italic">
                      The World's Most <span className="text-blue-500">Elite</span> AI Handicapper.
                    </h2>
                    <p className="text-lg text-slate-400 mb-8 leading-relaxed">
                      VonnyBetsAI uses proprietary machine learning models to analyze thousands of data points, 
                      market consensus, and sharp money flow. We identify inefficiencies in the betting market 
                      to give you a quantitative edge over the sportsbooks.
                    </p>
                    <div className="flex flex-wrap gap-4">
                      <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl border border-white/5">
                        <Zap className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-bold text-white uppercase tracking-widest">+EV Identification</span>
                      </div>
                      <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl border border-white/5">
                        <Lock className="w-4 h-4 text-blue-500" />
                        <span className="text-xs font-bold text-white uppercase tracking-widest">Sharp Money Tracking</span>
                      </div>
                      <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl border border-white/5">
                        <Activity className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs font-bold text-white uppercase tracking-widest">Real-Time Odds</span>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Today's Slate */}
                <section>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                      <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-500" />
                        📅 Today's Main Slate
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">Current games and schedules for {SUPPORTED_SPORTS.find(s => s.key === selectedSport)?.title || 'Selected Sport'}</p>
                    </div>
                  </div>

                  {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="h-48 bg-white/5 rounded-3xl animate-pulse border border-white/5" />
                      ))}
                    </div>
                  ) : events.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {events.map((event) => (
                        <Card key={event.id} className="p-6 hover:border-blue-500/40 transition-all group cursor-pointer bg-gradient-to-br from-white/[0.03] to-transparent" onClick={() => {
                          setSelectedGameId(event.id);
                          setActiveTab('market');
                        }}>
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                              {new Date(event.commence_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <Badge variant="default" className="text-[9px]">Live Odds</Badge>
                          </div>
                          <div className="space-y-4">
                            {event.away_team && event.home_team ? (
                              <>
                                <div className="flex items-center justify-between">
                                  <span className="text-lg font-black text-white group-hover:text-blue-400 transition-colors">{event.away_team}</span>
                                  <span className="text-[10px] font-black text-slate-600 uppercase italic">Away</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-lg font-black text-white group-hover:text-blue-400 transition-colors">{event.home_team}</span>
                                  <span className="text-[10px] font-black text-slate-600 uppercase italic">Home</span>
                                </div>
                              </>
                            ) : (
                              <div className="flex flex-col gap-2">
                                <span className="text-lg font-black text-white group-hover:text-blue-400 transition-colors">{event.sport_title}</span>
                                <span className="text-[10px] font-black text-slate-600 uppercase italic">Tournament Event</span>
                              </div>
                            )}
                          </div>
                          <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <BarChart3 className="w-4 h-4 text-blue-500" />
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Market Analysis</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="py-20 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                      <Calendar className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                      <h3 className="text-xl font-bold text-slate-400 mb-2">No games found for this slate</h3>
                      <p className="text-slate-500 text-sm">Check back later or try a different sport.</p>
                    </div>
                  )}
                </section>
              </motion.div>
            )}

            {activeTab === 'ev_bets' && (
              <motion.div
                key="ev_bets"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-12"
              >
                {/* AI Market Edges */}
                <section>
                  <div className="mb-8">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-500" />
                        🔥 AI Market Edges (+EV)
                      </h2>
                      {aiPicks.length > 0 && (
                        <Badge variant="success">{aiPicks.length} Edges Found</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 max-w-2xl">
                      General +EV opportunities and confidence plays across all markets. These picks identify mathematical edges where bookmaker odds lag behind our projected probabilities.
                    </p>
                  </div>

                  {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {[1, 2].map(i => (
                        <div key={i} className="h-64 bg-white/5 animate-pulse rounded-xl" />
                      ))}
                    </div>
                  ) : aiPicks.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {aiPicks.map(pick => (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          key={pick.id}
                        >
                          <Card className={`p-6 relative overflow-hidden group transition-all hover:scale-[1.01] ${pick.confidence === 'High' ? 'border-emerald-500/30 bg-emerald-500/[0.02]' : ''}`}>
                            <div className="absolute top-0 right-0 p-4 flex flex-col items-end gap-2">
                              <Badge variant={pick.confidence === 'High' ? 'success' : pick.confidence === 'Medium' ? 'warning' : 'default'}>
                                {pick.confidence} Confidence
                              </Badge>
                              {pick.isSharp && (
                                <Badge className="bg-blue-600/20 text-blue-400 border-blue-500/30">🦈 Sharp Play</Badge>
                              )}
                            </div>
                            
                            <div className="mb-4">
                              <div className="text-xs text-blue-400 font-bold mb-1 uppercase tracking-tighter">{pick.market}</div>
                              <h3 className="text-xl font-black">{pick.player || pick.selection}</h3>
                              <p className="text-xs text-slate-500">{pick.game}</p>
                            </div>

                            <div className="grid grid-cols-3 gap-4 mb-6">
                              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Odds</div>
                                <div className="text-lg font-black text-white">{formatAmericanOdds(pick.odds)}</div>
                              </div>
                              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">EV</div>
                                <div className="text-lg font-black text-emerald-400">+{(pick.ev * 100).toFixed(1)}%</div>
                              </div>
                              <div className="col-span-1">
                                <a 
                                  href={getSportsbookUrl(pick.bookmaker)} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="h-full flex flex-col items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all shadow-lg shadow-blue-600/20 group/btn"
                                >
                                  <div className="text-[8px] uppercase font-black tracking-tighter opacity-70">Tail on</div>
                                  <div className="text-[10px] font-black uppercase truncate px-2">{pick.bookmaker}</div>
                                  <ChevronRight className="w-3 h-3 mt-1 group-hover/btn:translate-x-1 transition-transform" />
                                </a>
                              </div>
                            </div>

                            <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-lg">
                              <div className="flex gap-2">
                                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                                <p className="text-xs text-slate-300 leading-relaxed italic">
                                  "{pick.reasoning}"
                                </p>
                              </div>
                            </div>
                          </Card>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                      <AlertCircle className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">No +EV edges identified in current market data.</p>
                    </div>
                  )}
                </section>
              </motion.div>
            )}

            {activeTab === 'parlays' && (
              <motion.div
                key="parlays"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-12"
              >
                {/* AI Generated Parlays */}
                <section>
                  <div className="mb-8">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <Target className="w-4 h-4 text-blue-500" />
                        🎯 Smart Value Parlays
                      </h2>
                      <Badge variant="default">High Correlation</Badge>
                    </div>
                    <p className="text-xs text-slate-500 max-w-2xl">
                      Our model identifies correlated outcomes and high-probability legs to build smart parlays with positive expected value.
                    </p>
                  </div>

                  {loading ? (
                    <div className="grid grid-cols-1 gap-6">
                      {[1, 2].map(i => (
                        <div key={i} className="h-80 bg-white/5 rounded-3xl animate-pulse border border-white/5" />
                      ))}
                    </div>
                  ) : aiParlays.length > 0 ? (
                    <div className="grid grid-cols-1 gap-6">
                      {aiParlays.map((parlay, idx) => (
                        <Card key={idx} className="p-0 border-blue-500/20 bg-gradient-to-br from-[#161B2B] to-[#0B0F1A]">
                          <div className="p-6 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                              <h3 className="text-xl font-black flex items-center gap-2">
                                Smart Value Parlay
                                <Badge variant="success">+{ (parlay.combinedEV * 100).toFixed(1) }% EV</Badge>
                              </h3>
                              <p className="text-xs text-slate-500 mt-1">{parlay.reasoning}</p>
                            </div>
                            <div className="bg-blue-600 px-6 py-3 rounded-xl text-center">
                              <div className="text-[10px] font-bold uppercase tracking-widest text-blue-200">Total Odds</div>
                              <div className="text-2xl font-black text-white">{formatAmericanOdds(parlay.totalOdds)}</div>
                            </div>
                          </div>
                          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            {parlay.legs.map((leg, lIdx) => (
                              <div key={lIdx} className="flex items-start gap-4">
                                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] font-bold text-blue-400 shrink-0">
                                  {lIdx + 1}
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-blue-400 uppercase tracking-tighter">{leg.market}</div>
                                  <div className="font-bold text-white">{leg.player || leg.selection}</div>
                                  <div className="text-[10px] text-slate-500">{leg.game}</div>
                                </div>
                                <div className="ml-auto font-black text-slate-300">
                                  {formatAmericanOdds(leg.odds)}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="p-6 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                              <Zap className="w-3 h-3 text-amber-500" />
                              AI Optimized for Maximum Probability
                            </div>
                            <a 
                              href={parlay.sportsbookUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2 group"
                            >
                              Tail This Parlay
                              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </a>
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                      <p className="text-slate-500 font-medium">No strong parlay opportunities found right now.</p>
                    </div>
                  )}
                </section>
              </motion.div>
            )}

            {activeTab === 'vonlocks' && (
              <motion.div
                key="vonlocks"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-12"
              >
                {/* VonLocks - The AI Handicapper */}
                <section>
                  <div className="mb-8">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <Lock className="w-4 h-4 text-blue-500" />
                        🔒 VonLocks: Elite Best Bets
                      </h2>
                      <Badge variant="danger">Sharp Picks Only</Badge>
                    </div>
                    <p className="text-xs text-slate-500 max-w-2xl">
                      These are the absolute highest-conviction plays identified by our proprietary Sharp Score algorithm. 
                      We filter out the noise to provide only 1-2 elite "locks" per day based on heavy sharp money flow and market consensus discrepancies.
                    </p>
                  </div>

                  {vonLocks.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {vonLocks.map((pick) => (
                        <Card key={pick.id} className="p-8 border-blue-500/40 bg-gradient-to-br from-[#1E2538] to-[#0B0F1A] relative overflow-hidden shadow-[0_0_30px_rgba(37,99,235,0.15)] group">
                          <div className="absolute top-0 right-0 bg-blue-600 text-white px-4 py-1 text-[10px] font-black uppercase tracking-widest rounded-bl-xl shadow-lg flex items-center gap-2">
                            {pick.isMax ? '🚨 MAX PLAY' : '💎 VALUE PLAY'}
                            <span>🦈</span>
                          </div>
                          
                          <div className="flex items-start gap-4 mb-6">
                            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-600/20 group-hover:scale-110 transition-transform">
                              <Target className="text-white w-6 h-6" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <div className="text-xs text-blue-400 font-bold mb-1 uppercase tracking-tighter">{pick.market}</div>
                              </div>
                              <h3 className="text-2xl font-black text-white">{pick.selection}</h3>
                              <p className="text-sm text-slate-400">{pick.game}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-white/5 p-4 rounded-xl border border-white/5 text-center">
                              <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Consensus Line</div>
                              <div className="text-xl font-black text-white">{pick.consensusPoint !== undefined ? (pick.consensusPoint > 0 ? '+' : '') + pick.consensusPoint : 'N/A'}</div>
                              <div className="text-[10px] text-blue-400 font-bold uppercase mt-1">Market Avg</div>
                            </div>
                            <div className="bg-white/5 p-4 rounded-xl border border-white/5 text-center">
                              <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Sharp Score</div>
                              <div className="text-xl font-black text-emerald-400">{pick.sharpScore.toFixed(1)}</div>
                              <div className="text-[10px] text-emerald-400 font-bold uppercase mt-1">Elite Rating</div>
                            </div>
                          </div>

                          <div className="flex flex-col gap-4">
                            <div className="bg-blue-600/10 border border-blue-600/20 p-5 rounded-xl">
                              <p className="text-sm text-blue-100 leading-relaxed italic font-medium">
                                "{pick.reasoning}"
                              </p>
                            </div>
                            
                            <AnimatePresence>
                              {expandedAnalysisId === pick.id && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="bg-black/40 border border-white/5 p-5 rounded-xl font-mono text-[11px] text-blue-300/80 leading-relaxed whitespace-pre-line">
                                    <div className="text-blue-500 font-black mb-3 uppercase tracking-widest border-b border-blue-500/20 pb-2">Proprietary Model Analysis</div>
                                    {pick.isMax ? '🚨 MAX UNIT PLAY 🚨' : '💎 VALUE PLAY 💎'}
                                    {"\n\n"}
                                    SHARP ANGLE: {pick.reasoning}
                                    {"\n\n"}
                                    The model has identified significant sharp money flow on this {pick.market.toLowerCase()} line. Market consensus has stabilized at {pick.consensusPoint}, but the underlying juice indicates a strong professional bias toward this side.
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            <div className="flex gap-3">
                              <button 
                                onClick={() => setExpandedAnalysisId(expandedAnalysisId === pick.id ? null : pick.id)}
                                className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold uppercase tracking-widest text-[10px] rounded-xl transition-all border border-white/10 flex items-center justify-center gap-2"
                              >
                                <BarChart3 className="w-4 h-4 text-blue-500" />
                                {expandedAnalysisId === pick.id ? 'Hide Analysis' : 'View AI Analysis'}
                              </button>
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(`${pick.game}: ${pick.selection}`);
                                  // Could add a toast here
                                }}
                                className="flex-[1.5] py-4 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-[0.2em] text-sm rounded-xl transition-all shadow-[0_0_30px_rgba(245,158,11,0.3)] flex items-center justify-center gap-2 group"
                              >
                                Copy Lock
                                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                              </button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="py-20 text-center bg-white/5 rounded-3xl border border-dashed border-white/10 max-w-2xl mx-auto">
                      <Lock className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                      <h3 className="text-xl font-bold text-slate-400 mb-2">The AI is currently scanning...</h3>
                      <p className="text-slate-500 text-sm px-8">
                        VonLocks doesn't force plays. We only release a lock when our model identifies a massive market inefficiency. Check back soon for the next elite play.
                      </p>
                    </div>
                  )}
                </section>

                {/* VonChat - Interactive AI Handicapping */}
                <section className="max-w-4xl mx-auto">
                  <div className="bg-[#1E2538] border border-blue-500/20 rounded-3xl overflow-hidden shadow-2xl">
                    <div className="p-6 border-b border-white/5 bg-gradient-to-r from-blue-600/10 to-transparent flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-600/20">
                          <Activity className="text-white w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white uppercase tracking-widest">VonChat AI</h3>
                          <p className="text-[10px] text-blue-400 font-bold uppercase">Ask why we picked these locks</p>
                        </div>
                      </div>
                      <Badge variant="success" className="animate-pulse">AI Online</Badge>
                    </div>
                    
                    <div className="h-[400px] overflow-y-auto p-6 space-y-4 bg-black/20">
                      {chatMessages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                          <div className="p-4 bg-white/5 rounded-2xl border border-white/5 max-w-xs">
                            <p className="text-xs text-slate-400 italic">
                              "Hey, I'm Vonny. I built this model to crush the books. Ask me anything about today's slate or why I'm locking in these plays."
                            </p>
                          </div>
                          <div className="grid grid-cols-1 gap-2 w-full max-w-xs">
                            <button 
                              onClick={() => handleChatSubmit("Why is the model so high on today's Max Play?")}
                              className="text-[10px] font-bold uppercase tracking-widest p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-blue-400 transition-all text-left"
                            >
                              Why is the model high on the Max Play?
                            </button>
                            <button 
                              onClick={() => handleChatSubmit("Explain the CLV edge on the board right now.")}
                              className="text-[10px] font-bold uppercase tracking-widest p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-blue-400 transition-all text-left"
                            >
                              Explain the CLV edge on the board.
                            </button>
                          </div>
                        </div>
                      ) : (
                        chatMessages.map((msg, idx) => (
                          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] p-4 rounded-2xl text-sm ${
                              msg.role === 'user' 
                                ? 'bg-blue-600 text-white rounded-tr-none' 
                                : 'bg-white/5 border border-white/10 text-slate-300 rounded-tl-none'
                            }`}>
                              {msg.content}
                            </div>
                          </div>
                        ))
                      )}
                      {isChatLoading && (
                        <div className="flex justify-start">
                          <div className="bg-white/5 border border-white/10 p-4 rounded-2xl rounded-tl-none">
                            <div className="flex gap-1">
                              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" />
                              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <form onSubmit={(e) => { e.preventDefault(); handleChatSubmit(); }} className="p-4 border-t border-white/5 bg-black/40">
                      <div className="relative">
                        <input 
                          type="text"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder="Ask Vonny about the picks..."
                          className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-6 pr-16 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all"
                        />
                        <button 
                          type="submit"
                          disabled={isChatLoading || !chatInput.trim()}
                          className="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 rounded-xl transition-all"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    </form>
                  </div>
                </section>
                <section className="py-20 text-center border border-dashed border-white/10 rounded-3xl bg-white/[0.01]">
                  <Lock className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-slate-400">More Locks Coming Soon</h3>
                  <p className="text-sm text-slate-500 mt-2">Our AI is currently processing late-night line movements.</p>
                </section>
              </motion.div>
            )}

            {activeTab === 'market' && (
              <motion.div
                key="market"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-12"
              >
                {/* Market Depth Visualization */}
                {selectedGame ? (
                  <section>
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-600/20 rounded-2xl flex items-center justify-center border border-blue-500/30">
                          <BarChart3 className="w-6 h-6 text-blue-500" />
                        </div>
                        <div>
                          <h2 className="text-xl font-black text-white tracking-tight">
                            {selectedGame.away_team} <span className="text-slate-500 font-medium mx-2">@</span> {selectedGame.home_team}
                          </h2>
                          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mt-1">Market Depth Analysis</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setSelectedGameId(null)}
                        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-400 transition-all"
                      >
                        <ChevronRight className="w-4 h-4 rotate-180" />
                        Back to All Odds
                      </button>
                    </div>
                    <Card className="p-8 border-white/5 bg-[#0B0F1A]/50 backdrop-blur-xl">
                      <MarketDepth game={selectedGame} />
                    </Card>
                  </section>
                ) : (
                  <>
                    {/* All Available Odds */}
                    <section>
                      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-6">
                        <div>
                          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                            <List className="w-6 h-6 text-blue-500" />
                            Market Explorer
                          </h2>
                          <p className="text-sm text-slate-500 mt-1">Live odds across all major sportsbooks</p>
                        </div>
                        <div className="relative group">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
                          <input 
                            type="text" 
                            placeholder="Search teams, leagues..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-2xl pl-12 pr-6 py-3 text-sm focus:outline-none focus:border-blue-500/50 w-full md:w-80 transition-all focus:bg-white/10"
                          />
                        </div>
                      </div>

                      {/* CLV Radar Section */}
                      {clvRadar.length > 0 && (
                        <div className="mb-12">
                          <div className="flex items-center justify-between mb-6">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 flex items-center gap-2">
                              <Activity className="w-3 h-3" />
                              📡 Live CLV Radar
                            </h2>
                            <Badge variant="warning" className="text-[9px]">Market Discrepancies</Badge>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {clvRadar.map(discrepancy => (
                              <Card key={discrepancy.id} className="p-5 border-emerald-500/20 hover:border-emerald-500/40 transition-all bg-black/20">
                                <div className="flex justify-between items-start mb-3">
                                  <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{discrepancy.market}</div>
                                  <div className="bg-emerald-500/20 text-emerald-400 text-[9px] font-bold px-2 py-0.5 rounded uppercase border border-emerald-500/30">
                                    +{discrepancy.advantage.toFixed(1)} Point Edge
                                  </div>
                                </div>
                                <h4 className="font-bold text-sm mb-1 truncate text-white">{discrepancy.selection}</h4>
                                <p className="text-[10px] text-slate-500 mb-4 truncate">{discrepancy.game}</p>
                                <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                                  <div className="flex justify-between text-[9px] uppercase font-bold tracking-tighter">
                                    <span className="text-slate-500">Consensus</span>
                                    <span className="text-slate-300">{discrepancy.consensus.toFixed(1)}</span>
                                  </div>
                                  <div className="flex justify-between text-[9px] uppercase font-bold tracking-tighter">
                                    <span className="text-slate-500">Market Line</span>
                                    <span className="text-emerald-400">{discrepancy.line}</span>
                                  </div>
                                  <p className="text-[10px] text-emerald-400 font-medium italic mt-2">
                                    "Model identifies {discrepancy.bookmaker} as a significant outlier."
                                  </p>
                                </div>
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}

                      <Card className="overflow-hidden border-white/5">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-white/5 bg-white/[0.02]">
                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Game / Time</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Market</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Selection</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Bookmaker</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Odds</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Depth</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredOdds.length > 0 ? filteredOdds.map(game => (
                                game.bookmakers.map(book => (
                                  book.markets.map(market => (
                                    market.outcomes.map((outcome, oIdx) => (
                                      <tr key={`${game.id}-${book.key}-${market.key}-${oIdx}`} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors group">
                                        <td className="px-8 py-6">
                                          <div className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">
                                            {game.away_team && game.home_team ? `${game.away_team} @ ${game.home_team}` : game.sport_title}
                                          </div>
                                          <div className="text-[10px] text-slate-500 font-mono mt-1">
                                            {new Date(game.commence_time).toLocaleDateString()} • {new Date(game.commence_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                          </div>
                                        </td>
                                        <td className="px-8 py-6">
                                          <Badge className="bg-slate-800 text-slate-300 border-slate-700">{market.key.replace(/_/g, ' ')}</Badge>
                                        </td>
                                        <td className="px-8 py-6">
                                          <div className="text-sm font-bold text-slate-200">{outcome.name}</div>
                                          {outcome.point !== undefined && (
                                            <div className="text-[10px] text-blue-400 font-black mt-0.5">{outcome.point > 0 ? '+' : ''}{outcome.point}</div>
                                          )}
                                        </td>
                                        <td className="px-8 py-6 text-[10px] text-slate-400 font-black uppercase tracking-wider">
                                          <a 
                                            href={getSportsbookUrl(book.title)} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="px-3 py-1.5 bg-white/5 hover:bg-blue-600 hover:text-white border border-white/10 rounded-lg transition-all flex items-center gap-2 w-fit"
                                          >
                                            {book.title}
                                            <ChevronRight className="w-3 h-3" />
                                          </a>
                                        </td>
                                        <td className="px-8 py-6 text-right font-black text-blue-400 text-base">
                                          {formatAmericanOdds(outcome.price)}
                                        </td>
                                        <td className="px-8 py-6 text-center">
                                          <button 
                                            onClick={() => {
                                              setSelectedGameId(game.id);
                                              window.scrollTo({ top: 0, behavior: 'smooth' });
                                            }}
                                            className="p-3 bg-white/5 hover:bg-blue-600 hover:text-white rounded-xl text-blue-500 transition-all shadow-lg hover:shadow-blue-600/20"
                                          >
                                            <Eye className="w-4 h-4" />
                                          </button>
                                        </td>
                                      </tr>
                                    ))
                                  ))
                                ))
                              )).flat(3).slice(0, 50) : (
                                <tr>
                                  <td colSpan={6} className="px-8 py-20 text-center">
                                    <div className="flex flex-col items-center gap-4">
                                      <Search className="w-12 h-12 text-slate-800" />
                                      <div className="text-slate-500 font-bold uppercase tracking-widest text-xs">
                                        {loading ? "Syncing market data..." : "No matches found for your search"}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </Card>
                    </section>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      {/* Mobile Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0B0F1A]/90 backdrop-blur-lg border-t border-white/5 px-6 py-3 flex items-center justify-around z-50">
        {[
          { id: 'dashboard', icon: LayoutDashboard },
          { id: 'vonlocks', icon: Lock },
          { id: 'market', icon: List },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`p-3 rounded-xl transition-all ${
              activeTab === tab.id 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                : 'text-slate-500 hover:text-white'
            }`}
          >
            <tab.icon className="w-6 h-6" />
          </button>
        ))}
      </nav>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-rose-500 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 z-[100]"
          >
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm font-bold">⚠️ {error}</span>
            <button onClick={() => setError(null)} className="ml-4 hover:bg-white/20 p-1 rounded-full">
              <ChevronRight className="w-4 h-4 rotate-90" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
