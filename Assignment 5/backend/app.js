// Sweet Scoop — API Gateway / Main Application
// Orchestrates all microservices, Swagger UI, GraphQL, and global middleware.
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const { graphqlHTTP } = require('express-graphql');

const { correlationMiddleware, createLogger } = require('./middleware/logger');
const { errorHandler, notFound, AppError } = require('./middleware/errorHandler');
const { rateLimitWithRetryAfter } = require('./middleware/rateLimit');
const { contentNegotiation } = require('./middleware/contentNegotiation');
const { schema, root } = require('./graphql/schema');

const catalogueRoutes = require('./services/catalogue');
const customerRoutes = require('./services/customer');
const orderRoutes = require('./services/order');
const paymentRoutes = require('./services/payment');
const deliveryRoutes = require('./services/delivery');
const reviewsRoutes = require('./services/reviews');

const app = express();
const log = createLogger('gateway');
const PORT = process.env.PORT || 3000;

// ---- Global middleware ----
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS (Checklist #22)
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'If-Match', 'If-None-Match', 'X-Correlation-Id'],
  exposedHeaders: ['ETag', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After', 'Location'],
  credentials: true,
  maxAge: 86400
}));
app.options('*', cors());

app.use(correlationMiddleware);
app.use(rateLimitWithRetryAfter);
app.use(contentNegotiation);

// ---- Health check ----
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'sweetscoop-gateway', timestamp: new Date().toISOString() });
});

// ---- Swagger UI (Checklist #14) ----
try {
  const openapiPath = path.resolve(__dirname, '../openapi.yaml');
  const swaggerDocument = YAML.load(openapiPath);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, { explorer: true }));
  log.info('Swagger UI mounted at /api-docs');
} catch (e) {
  log.warn('Could not load openapi.yaml', { error: e.message });
}

// ---- GraphQL endpoint (Checklist #15) ----
app.use('/graphql', graphqlHTTP({
  schema,
  rootValue: root,
  graphiql: true
}));

// ---- Mount microservice routes under /v1 (Checklist #3) ----
app.use('/v1', catalogueRoutes);
app.use('/v1', customerRoutes);
app.use('/v1', orderRoutes);
app.use('/v1', paymentRoutes);
app.use('/v1', deliveryRoutes);
app.use('/v1', reviewsRoutes);

// ---- WSDL inspection endpoint ----
app.get('/wsdl', (req, res) => {
  const fs = require('fs');
  const wsdlPath = path.resolve(__dirname, '../partner.wsdl');
  if (fs.existsSync(wsdlPath)) {
    res.setHeader('Content-Type', 'text/xml');
    res.send(fs.readFileSync(wsdlPath, 'utf8'));
  } else {
    res.status(404).send('WSDL not found');
  }
});

// ---- 404 handler ----
app.use(notFound);

// ---- Centralized error handler (Checklist #19) ----
app.use(errorHandler);

// ---- Start server ----
if (require.main === module) {
  app.listen(PORT, () => {
    log.info('Sweet Scoop API gateway started', { port: PORT });
    console.log(`\n  Sweet Scoop API running on http://localhost:${PORT}`);
    console.log(`  Swagger UI:  http://localhost:${PORT}/api-docs`);
    console.log(`  GraphQL:     http://localhost:${PORT}/graphql`);
    console.log(`  Health:      http://localhost:${PORT}/health\n`);
  });
}

module.exports = app;
