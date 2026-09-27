const bcrypt = require("bcrypt");
const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");

// =========================
// LOGIN
// =========================

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username dan password wajib diisi",
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        username: String(username).trim(),
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Username atau password salah",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Akun tidak aktif",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Username atau password salah",
      });
    }

    // Buat UUID baru setiap login
    const token = randomUUID();

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        token,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Login berhasil",
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

// =========================
// LOGOUT
// =========================

const logout = async (req, res, next) => {
  try {
    await prisma.user.update({
      where: {
        id: req.user.id,
      },
      data: {
        token: null,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Logout berhasil",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  logout,
};
