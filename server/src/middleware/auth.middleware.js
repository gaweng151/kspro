const prisma = require("../config/prisma");
const AppError = require("../utils/AppError");

const authMiddleware = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      throw new AppError(401, "Token Not Found");
    }

    const token = authorization.split(" ")[1];

    const user = await prisma.user.findFirst({
      where: {
        token,
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) {
      throw new AppError(401, "Invalid token");
    }

    // Simpan data user untuk controller berikutnya
    req.user = user;

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = authMiddleware;
