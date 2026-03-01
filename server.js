require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const morgan = require('morgan');

const { pool } = require('./src/db');

const authRoutes = require('./src/routes/auth.routes');
const appRoutes = require('./src/routes/app.routes');
const employeeRoutes = require('./src/routes/employees.routes');
const referenceRoutes = require('./src/routes/reference.routes');
const exportRoutes = require('./src/routes/export.routes');
const balanceRoutes = require('./src/routes/balance.routes');
const scanRoutes = require('./src/routes/scan.routes');
const adminRoutes = require('./src/routes/admin.routes');

const app = express();

// Trust proxy for Railway
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(morgan('tiny'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  store: new pgSession({
    pool,
    tableName: 'sessions',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

// EJS
app.set('views', path.join(__dirname, 'src', 'views'));
app.set('view engine', 'ejs');

// Static
app.use('/public', express.static(path.join(__dirname, 'public')));

// Locals
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.admin = req.session.admin || null;
  next();
});

app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/app');
  return res.redirect('/login');
});

// Routes
app.use(authRoutes);
app.use(appRoutes);
app.use(employeeRoutes);
app.use(referenceRoutes);
app.use(exportRoutes);
app.use(balanceRoutes);
app.use(scanRoutes);
app.use(adminRoutes);

// 404
app.use((req, res) => {
  res.status(404).send('404 - Not found');
});

const port = parseInt(process.env.PORT || '3000', 10);
app.listen(port, () => {
  console.log(`Punctoo MVP running on port ${port}`);
});