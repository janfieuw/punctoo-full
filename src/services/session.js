const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const db = require("../db");

const SESSION_DAYS = Number(process.env.SESSION_DAYS || "30");
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "punctoo_session";

const sessionMiddleware = session({
  store: new pgSession({
    pool: db.pool,
    tableName: "sessions",
    createTableIfMissing: true,
  }),
  name: SESSION_COOKIE_NAME,
  secret: process.env.SESSION_SECRET || "change_me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  },
});

module.exports = { sessionMiddleware };
