const express = require("express");
const path = require("path");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

const { initDb } = require("./db/init");
const sessionSvc = require("./services/session");
const { attachUser, attachCompany } = require("./middleware/auth");

const authRoutes = require("./routes/auth");
const myRoutes = require("./routes/my");
const adminRoutes = require("./routes/admin");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use("/public", express.static(path.join(__dirname, "..", "public")));
app.use("/static", express.static(path.join(__dirname, "..", "public", "static")));

// Init DB once at boot
initDb()
  .then(() => console.log("DB init OK"))
  .catch((e) => {
    console.error("DB init failed:", e);
    process.exit(1);
  });

// light cleanup occasionally
setInterval(() => sessionSvc.purgeExpiredSessions().catch(() => {}), 60 * 60 * 1000);

app.use(attachUser);
app.use(attachCompany);

// locals
app.use((req, _res, next) => {
  req.appBaseUrl = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  next();
});

app.get("/", (req, res) => {
  if (!req.user) return res.redirect("/login");
  return res.redirect("/my");
});

app.use(authRoutes);
app.use(myRoutes);
app.use(adminRoutes);

// 404
app.use((_req, res) => res.status(404).send("Not found"));

// error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).send("Server error");
});

module.exports = app;
