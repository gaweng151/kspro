const express = require("express");
const cors = require("cors");

const app = express();

app.use(express.json());
app.use(cors());

app.use("/test", (req, res) => {
  res.json({ test: "ok" });
});

module.exports = app;
