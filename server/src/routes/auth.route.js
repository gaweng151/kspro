const express = require("express");

const router = express.Router();

const { login, logout } = require("../controllers/auth.controller");

const authMiddleware = require("../middleware/auth.middleware");

router.post("/login", login);

router.post("/logout", authMiddleware, logout);

module.exports = router;
