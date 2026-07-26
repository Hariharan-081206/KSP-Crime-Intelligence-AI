// File: backend/functions/query/index.js

// MUST be the first import. Service modules read process.env at module scope
// (ragService.js, forecastService.js, quickmlService.js), and ESM evaluates
// imports in order — so the .env has to be loaded before they are imported or
// they capture `undefined`. `dotenv` was already a dependency but never loaded.
// Catalyst ships the function directory as-is, so a .env beside index.js is
// read in the cloud too; see .env.example for the required keys.
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import catalyst from 'zcatalyst-sdk-node';

// Routes
import authRoutes from './routes/authRoutes.js';
import queryRoutes from './routes/queryRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import networkGraphRoutes from "./routes/networkGraphRoutes.js";
import mapRoutes from "./routes/mapRoutes.js";
import behaviouralProfileRoutes from './routes/behaviouralProfileRoutes.js';
import alertsRoutes from './routes/alertsRoutes.js';
import exportRoutes from './routes/exportRoutes.js';
import forecastRoutes from './routes/forecastRoutes.js';
import historyRoutes from './routes/historyRoutes.js';

// Services
import relationshipService from './services/relationshipService.js';
import { runWithCatalystApp } from './services/catalystContext.js';

import logger from './utils/logger.js';

const app = express();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Relationship Cache Flag
// ---------------------------------------------------------------------------
let cacheInitialized = false;

// ---------------------------------------------------------------------------
// Catalyst Initialization Middleware
// ---------------------------------------------------------------------------
app.use(async (req, res, next) => {
  try {

    req.catalystApp = catalyst.initialize(req);

    // Initialize relationship cache only once
    if (!cacheInitialized) {

      logger.info(
        'RelationshipService',
        'Initializing relationship cache...'
      );

      await relationshipService.initialize(req.catalystApp);

      cacheInitialized = true;

      logger.info(
        'RelationshipService',
        'Relationship cache initialized successfully.'
      );
    }

    // Bind the app to this request's async context so the service layer can
    // reach it without threading it through ~60 call sites. Request-scoped, so
    // concurrent requests in a warm container never see each other's identity.
    // See services/catalystContext.js for why this exists.
    runWithCatalystApp(req.catalystApp, next);

  } catch (err) {

    logger.error(
      'functions/query/index',
      'Failed to initialize Catalyst SDK',
      err
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to initialize backend services.',
      error: err.message
    });

  }
});

// ---------------------------------------------------------------------------
// Request Logger
// ---------------------------------------------------------------------------
app.use((req, res, next) => {

  logger.info(
    'functions/query/index',
    `${req.method} ${req.originalUrl}`
  );

  next();

});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
// Mount points are the spec §8 surface consumed by the frontend (authoritative
// contract). The API Gateway maps ANY /api/{path:(.*)} -> this function, so the
// paths below are exactly what the SPA calls minus its /api prefix.
app.use('/auth', authRoutes);                    // GET /auth/role
app.use('/query', queryRoutes);                  // POST /query
app.use("/map", mapRoutes);                      // GET /map/hotspots, /map/district/:districtId
app.use('/graph', networkGraphRoutes);           // GET /graph/network
app.use('/profile', behaviouralProfileRoutes);   // GET /profile/behavioral   (was /behaviour)
app.use('/predict', forecastRoutes);             // POST /predict/forecast    (was /forecast)
app.use('/alerts', alertsRoutes);                // GET /alerts/active
app.use('/export', exportRoutes);                // POST /export/pdf
app.use('/conversation', historyRoutes);         // GET /conversation/:sessionId (was /history/:threadId)

// Non-§8 surfaces retained as-is; no frontend caller. Deeper functional repair
// of these is deferred (see AUDIT.md Phase 3), so they keep their old paths.
app.use('/report', reportRoutes);
app.use('/history', historyRoutes);              // legacy alias of /conversation

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {

  res.status(200).json({

    success: true,

    message: 'SCRB Query Function Running',

    cacheLoaded: cacheInitialized,

    timestamp: Date.now()

  });

});

// ---------------------------------------------------------------------------
// 404
// ---------------------------------------------------------------------------
app.use((req, res) => {

  res.status(404).json({

    success: false,

    message: `Route not found : ${req.method} ${req.originalUrl}`

  });

});

// ---------------------------------------------------------------------------
// Error Handler
// ---------------------------------------------------------------------------
app.use((err, req, res, next) => {

  logger.error(
    'functions/query/index',
    'Unhandled Error',
    err
  );

  res.status(err.statusCode || 500).json({

    success: false,

    message: err.message || 'Internal Server Error',

    ...(process.env.NODE_ENV !== 'production' && {
      stack: err.stack
    })

  });

});

export default app;