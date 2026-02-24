require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);

const db = require("./db");
const { initDb } = require("./db/init");

const authRoutes = require("./routes/auth");
const myRoutes = require("./routes/my");
const adminRoutes = require("./routes/admin");

const { attachUser } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 8080;

// 🔐 Railway reverse proxy fix
app.set("trust proxy", 1);

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files
app.use("/public", express.static(path.join(__dirname, "..", "public")));
app.use("/static", express.static(path.join(__dirname, "..", "public", "static")));

// 🗄 Session setup (Postgres-backed)
app.use(
  session({
    store: new pgSession({
      pool: db,
      tableName: "user_sessions",
    }),
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

// Attach user + company to req + res.locals
app.use(attachUser);

// =========================
// ROUTING STRUCTURE (FULL)
// =========================

// Root
app.get("/", (req, res) => {
  if (req.session && req.session.userId) return res.redirect("/app");
  return res.redirect("/signup");
});

// Legacy alias: /my -> /app
app.get("/my", (req, res) => res.redirect("/app"));
app.use("/my", (req, res) => res.redirect("/app" + req.path));

// FULL routes
app.use(authRoutes);
app.use(myRoutes);
app.use(adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).send("Not found");
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).send("Server error");
});

// =========================
// START SERVER
// =========================

(async () => {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`🚀 MyPunctoo running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start:", err);
    process.exit(1);
  }
})();