const prisma = require("../config/prisma");
const { Prisma } = require("../generated/prisma");

// =========================
// HELPER
// =========================

const decimal = (value = 0) => new Prisma.Decimal(value);

const roundMoney = (value) =>
  decimal(value).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);

const isWeekend = (date) => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

const timeToMinutes = (date) => date.getHours() * 60 + date.getMinutes();

// Memeriksa apakah waktu masuk ke rentang harga.
// Mendukung rentang yang melewati tengah malam.
const isInTimeRange = (date, startTime, endTime) => {
  const current = timeToMinutes(date);
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);

  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;

  if (start <= end) {
    return current >= start && current < end;
  }

  return current >= start || current < end;
};

// =========================
// ROOM PRICING
// =========================

async function getRoomPrice(roomId, date) {
  const pricings = await prisma.roomPricing.findMany({
    where: {
      roomId,
      isActive: true,
    },
  });

  const weekend = isWeekend(date);

  // Prioritas:
  // Weekend > Promo > Regular
  const available = pricings.filter((pricing) =>
    isInTimeRange(date, pricing.startTime, pricing.endTime),
  );

  const selected =
    (weekend && available.find((item) => item.type === "WEEKEND")) ||
    available.find((item) => item.type === "PROMO") ||
    available.find((item) => item.type === "REGULAR");

  if (!selected) {
    throw new Error(
      `Harga room ${roomId} tidak ditemukan untuk waktu tersebut`,
    );
  }

  return decimal(selected.price);
}

// =========================
// ROOM BILLING
// =========================

// Menghitung biaya room berdasarkan durasi aktual.
// Harga dibagi per menit, bukan membulatkan setiap jam.
// Contoh 90 menit dengan harga Rp60.000/jam = Rp90.000.
async function calculateRoomCharge(session) {
  if (!session.startedAt) {
    throw new Error("Session belum memiliki waktu mulai");
  }

  const endAt = session.endedAt || new Date();

  if (endAt < session.startedAt) {
    throw new Error("Waktu selesai tidak boleh sebelum waktu mulai");
  }

  const durationMs = endAt.getTime() - session.startedAt.getTime();
  const durationMinutes = Math.ceil(durationMs / 60000);

  let amount = decimal(0);

  // Menghitung harga berdasarkan perubahan tarif.
  // Setiap menit menggunakan harga yang berlaku
  // pada waktu tersebut.
  for (let i = 0; i < durationMinutes; i++) {
    const minuteDate = new Date(session.startedAt.getTime() + i * 60000);

    const priceHour = await getRoomPrice(session.roomId, minuteDate);

    amount = amount.add(priceHour.div(60));
  }

  return {
    durationMinutes,
    amount: roundMoney(amount),
  };
}

// =========================
// COMPANION BILLING
// =========================

// Companion TIDAK dikenakan pajak atau service.
function calculateCompanionCharge(companionSession, endAt = new Date()) {
  const start = companionSession.startedAt;
  const end = companionSession.endedAt || endAt;

  if (end < start) {
    throw new Error("Waktu companion tidak valid");
  }

  const durationMinutes = Math.ceil((end.getTime() - start.getTime()) / 60000);

  const priceHour = decimal(companionSession.priceHour);

  const amount = priceHour.mul(durationMinutes).div(60);

  return {
    durationMinutes,
    subtotal: roundMoney(amount),
    taxAmount: decimal(0),
    serviceAmount: decimal(0),
    total: roundMoney(amount),
  };
}

// =========================
// CHARGE CALCULATION
// =========================

async function calculateCharges(baseAmount, options = {}) {
  const { useTax = true, useService = true } = options;

  const settings = await prisma.chargeSetting.findMany({
    where: {
      isActive: true,
    },
  });

  const subtotal = decimal(baseAmount);

  let serviceAmount = decimal(0);
  let taxAmount = decimal(0);

  if (useService) {
    const service = settings.filter((charge) => charge.category === "SERVICE");

    for (const charge of service) {
      const base = charge.afterDiscount ? subtotal : subtotal;

      serviceAmount = serviceAmount.add(base.mul(charge.value).div(100));
    }
  }

  if (useTax) {
    const taxes = settings.filter((charge) => charge.category === "TAX");

    for (const charge of taxes) {
      let base = charge.afterDiscount ? subtotal : subtotal;

      // Tax dihitung dari subtotal + service.
      // Companion tidak dimasukkan ke dasar pajak.
      base = base.add(serviceAmount);

      taxAmount = taxAmount.add(base.mul(charge.value).div(100));
    }
  }

  return {
    serviceAmount: roundMoney(serviceAmount),
    taxAmount: roundMoney(taxAmount),
    total: roundMoney(subtotal.add(serviceAmount).add(taxAmount)),
  };
}

// =========================
// SESSION BILLING
// =========================

async function calculateSessionBilling(sessionId) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      companions: true,
      orders: {
        where: {
          status: {
            not: "CANCELLED",
          },
        },
      },
    },
  });

  if (!session) {
    throw new Error("Session tidak ditemukan");
  }

  const room = await calculateRoomCharge(session);

  // Paket menggantikan biaya room jika dipilih.
  const roomSubtotal = session.packagePrice
    ? decimal(session.packagePrice)
    : room.amount;

  let companionSubtotal = decimal(0);

  for (const companion of session.companions) {
    const result = calculateCompanionCharge(
      companion,
      session.endedAt || new Date(),
    );

    companionSubtotal = companionSubtotal.add(result.total);
  }

  const orderSubtotal = session.orders.reduce(
    (sum, order) => sum.add(order.total),
    decimal(0),
  );

  // Companion tidak dikenakan tax/service.
  // Order sudah menyimpan total beserta charge.
  const subtotal = roomSubtotal.add(companionSubtotal).add(orderSubtotal);

  const charges = await calculateCharges(roomSubtotal);

  const total = roundMoney(
    roomSubtotal
      .add(charges.taxAmount)
      .add(charges.serviceAmount)
      .add(companionSubtotal)
      .add(orderSubtotal),
  );

  return {
    sessionId,
    durationMinutes: room.durationMinutes,

    roomSubtotal: roundMoney(roomSubtotal),
    companionSubtotal: roundMoney(companionSubtotal),
    orderSubtotal: roundMoney(orderSubtotal),

    subtotal: roundMoney(subtotal),

    taxAmount: charges.taxAmount,
    serviceAmount: charges.serviceAmount,

    total,
  };
}

// =========================
// EXPORT
// =========================

module.exports = {
  calculateRoomCharge,
  calculateCompanionCharge,
  calculateCharges,
  calculateSessionBilling,
};

// const { calculateSessionBilling } = require("../services/billing.service");

// const finishSession = async (req, res, next) => {
//   try {
//     const sessionId = Number(req.params.id);

//     const billing = await calculateSessionBilling(sessionId);

//     return res.status(200).json({
//       success: true,
//       data: billing,
//     });
//   } catch (error) {
//     next(error);
//   }
// };

// module.exports = { finishSession };
