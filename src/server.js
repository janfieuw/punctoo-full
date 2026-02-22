require("dotenv").config();
const express = require("express");
const path = require("path");

const { initDb } = require("./db/init");
const { sessionMiddleware } = require("./services/session");
const authRoutes = require("./routes/auth");
const myRoutes = require("./routes/my");
const adminRoutes = require("./routes/admin");

const app = express();

// Railway/Reverse proxy: allow secure cookies behind proxy (X-Forwarded-Proto)
app.set("trust proxy", 1);

const PORT = process.env.PORT || 8080;
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static
app.use("/static", express.static(path.join(__dirname, "..", "public", "static")));
app.use("/public", express.static(path.join(__dirname, "..", "public")));

// App base url for PDF links etc.
app.use((req, res, next) => {
  req.appBaseUrl = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
  next();
});

// Sessions + current user
app.use(sessionMiddleware);

// Routes
app.use(authRoutes);
app.use(myRoutes);
app.use(adminRoutes);

// Home redirect
app.get("/", (req, res) => {
  if (req.session && req.session.userId) return res.redirect("/my");
  return res.redirect("/login");
});

// Basic error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).send("Server error");
});

(async () => {
  try {
    await initDb();
    app.listen(PORT, () => console.log(`MyPunctoo running on http://localhost:${PORT}`));
  } catch (e) {
    console.error("DB init failed:", e);
    process.exit(1);
  }
})();
