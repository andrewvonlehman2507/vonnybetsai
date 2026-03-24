import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const ODDS_API_KEY = process.env.ODDS_API_KEY;

// API Key Validation Middleware
const validateApiKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!ODDS_API_KEY || ODDS_API_KEY.trim() === "") {
    return res.status(401).json({ 
      error: "API Key Missing", 
      message: "Please add your ODDS_API_KEY to the Secrets panel in AI Studio." 
    });
  }
  next();
};

// In-memory cache
const cache: Record<string, { data: any; expires: number }> = {};

const getCachedData = (key: string) => {
  const cached = cache[key];
  if (cached && Date.now() < cached.expires) {
    console.log(`[Cache] Hit: ${key}`);
    return cached.data;
  }
  return null;
};

const setCacheData = (key: string, data: any, ttlSeconds: number) => {
  cache[key] = {
    data,
    expires: Date.now() + ttlSeconds * 1000,
  };
  console.log(`[Cache] Set: ${key} (TTL: ${ttlSeconds}s)`);
};

app.use(express.json());

// API Routes
app.get("/api/projections", (req, res) => {
  // In a real app, this would fetch from a stats API (e.g. SportsData.io or similar)
  // For this demo, we provide a robust set of baseline projections for top players
  const projections = {
    "LeBron James": { points: 25.4, rebounds: 7.2, assists: 8.1, last5Avg: 26.2, usageRate: 28.5, oppDefRank: 18 },
    "Kevin Durant": { points: 27.1, rebounds: 6.5, assists: 5.2, last5Avg: 28.4, usageRate: 30.1, oppDefRank: 12 },
    "Stephen Curry": { points: 26.8, rebounds: 4.5, assists: 6.1, last5Avg: 25.5, usageRate: 31.2, oppDefRank: 22 },
    "Nikola Jokic": { points: 26.1, rebounds: 12.4, assists: 9.2, last5Avg: 27.8, usageRate: 29.8, oppDefRank: 5 },
    "Luka Doncic": { points: 33.5, rebounds: 9.1, assists: 9.8, last5Avg: 35.2, usageRate: 35.5, oppDefRank: 15 },
    "Giannis Antetokounmpo": { points: 30.2, rebounds: 11.5, assists: 6.2, last5Avg: 31.4, usageRate: 32.8, oppDefRank: 8 },
    "Jayson Tatum": { points: 27.5, rebounds: 8.2, assists: 4.8, last5Avg: 26.9, usageRate: 29.5, oppDefRank: 10 },
    "Joel Embiid": { points: 34.1, rebounds: 11.2, assists: 5.8, last5Avg: 33.5, usageRate: 36.2, oppDefRank: 4 },
    "Shai Gilgeous-Alexander": { points: 31.2, rebounds: 5.5, assists: 6.5, last5Avg: 32.1, usageRate: 31.8, oppDefRank: 14 },
    "Anthony Edwards": { points: 26.5, rebounds: 5.4, assists: 5.1, last5Avg: 28.2, usageRate: 30.5, oppDefRank: 7 },
  };
  res.json(projections);
});

app.get("/api/sports", validateApiKey, async (req, res) => {
  const cacheKey = "sports";
  const cached = getCachedData(cacheKey);
  if (cached) return res.json(cached);

  try {
    const response = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${ODDS_API_KEY}`);
    const data = await response.json();
    if (response.ok) {
      setCacheData(cacheKey, data, 3600);
      res.json(data);
    } else {
      res.status(response.status).json(data);
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch sports" });
  }
});

app.get("/api/events", validateApiKey, async (req, res) => {
  const sport = req.query.sport as string || "basketball_nba";
  const cacheKey = `events_${sport}`;
  const cached = getCachedData(cacheKey);
  if (cached) return res.json(cached);

  try {
    // For Golf, we might need to find the active tournament if "golf" is passed generically
    let activeSport = sport;
    if (sport === "golf") {
      const sportsRes = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${ODDS_API_KEY}`);
      const sportsData = await sportsRes.json();
      const activeGolf = sportsData.find((s: any) => s.key.startsWith("golf_") && s.active);
      if (activeGolf) activeSport = activeGolf.key;
      else activeSport = "golf_pga_championship"; // Fallback
    }

    const response = await fetch(`https://api.the-odds-api.com/v4/sports/${activeSport}/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`);
    const data = await response.json();
    
    if (response.ok) {
      const events = data.map((item: any) => ({
        id: item.id,
        sport_key: item.sport_key,
        sport_title: item.sport_title,
        commence_time: item.commence_time,
        home_team: item.home_team,
        away_team: item.away_team
      }));
      
      setCacheData(cacheKey, { data: events, activeSport }, 1800);
      setCacheData(`full_odds_${sport}`, data, 1800);
      
      res.json({ data: events, activeSport });
    } else {
      res.status(response.status).json(data);
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

app.get("/api/odds", validateApiKey, async (req, res) => {
  const eventId = req.query.eventId;
  const sport = req.query.sport as string || "basketball_nba";
  
  if (!eventId) return res.status(400).json({ error: "eventId is required" });

  const fullOdds = getCachedData(`full_odds_${sport}`);
  if (fullOdds) {
    const eventOdds = fullOdds.find((item: any) => item.id === eventId);
    if (eventOdds) {
      return res.json({ data: eventOdds });
    }
  }

  try {
    // If not in cache, we need to fetch. We use the same logic as /api/events to find the active sport if needed.
    let activeSport = sport;
    if (sport === "golf") {
      const sportsRes = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${ODDS_API_KEY}`);
      const sportsData = await sportsRes.json();
      const activeGolf = sportsData.find((s: any) => s.key.startsWith("golf_") && s.active);
      if (activeGolf) activeSport = activeGolf.key;
    }

    const response = await fetch(`https://api.the-odds-api.com/v4/sports/${activeSport}/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`);
    const data = await response.json();
    
    if (response.ok) {
      const eventOdds = data.find((item: any) => item.id === eventId);
      if (eventOdds) {
        res.json({ data: eventOdds });
      } else {
        res.status(404).json({ error: "Event not found" });
      }
    } else {
      res.status(response.status).json(data);
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch odds" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
