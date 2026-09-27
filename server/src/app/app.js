const express = require("express");
const cors = require("cors");
const AppError = require("../utils/AppError");

const app = express();

app.use(express.json());
app.use(cors());

app.use("/test", (req, res) => {
  res.json({ test: "ok" });
});

app.use(require("../routes/auth.route"));

app.use((err, req, res, next) => {
  if (!err) {
    next();
  }
  console.log(err);
  if (err instanceof AppError) {
    return res.status(err.status).json({
      message: err.message,
    });
  } else {
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

module.exports = app;
