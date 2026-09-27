const { PrismaClient } = require("../src/generated/prisma");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

async function main() {
  console.log("Memulai seed database karaoke...");

  // =========================
  // 1. USER
  // =========================

  const adminPassword = await bcrypt.hash("admin", 10);
  const staffPassword = await bcrypt.hash("staff", 10);

  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password: adminPassword,
      role: "ADMIN",
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { username: "staff" },
    update: {},
    create: {
      username: "staff",
      password: staffPassword,
      role: "STAFF",
      isActive: true,
    },
  });

  console.log("User admin dan staff dibuat.");

  // =========================
  // 2. ROOM (20 ROOMS)
  // =========================

  const rooms = Array.from({ length: 20 }, (_, index) => {
    const number = index + 1;

    let type;

    if (number <= 5) {
      type = "Small";
    } else if (number <= 12) {
      type = "Medium";
    } else if (number <= 18) {
      type = "Large";
    } else {
      type = "VIP";
    }

    return {
      name: `Room ${number}`,
      type,
    };
  });

  const roomPrices = {
    Small: {
      REGULAR: 50000,
      PROMO: 35000,
      WEEKEND: 65000,
    },
    Medium: {
      REGULAR: 75000,
      PROMO: 50000,
      WEEKEND: 95000,
    },
    Large: {
      REGULAR: 100000,
      PROMO: 75000,
      WEEKEND: 125000,
    },
    VIP: {
      REGULAR: 150000,
      PROMO: 100000,
      WEEKEND: 200000,
    },
  };

  for (const roomData of rooms) {
    const room = await prisma.room.upsert({
      where: {
        name: roomData.name,
      },
      update: {
        type: roomData.type,
      },
      create: {
        name: roomData.name,
        type: roomData.type,
        status: "AVAILABLE",
      },
    });

    const prices = roomPrices[roomData.type];

    const pricingRules = [
      {
        type: "REGULAR",
        startTime: "10:00",
        endTime: "18:00",
        price: prices.REGULAR,
      },
      {
        type: "PROMO",
        startTime: "18:00",
        endTime: "22:00",
        price: prices.PROMO,
      },
      {
        type: "WEEKEND",
        startTime: "10:00",
        endTime: "23:59",
        price: prices.WEEKEND,
      },
    ];

    for (const pricing of pricingRules) {
      const existing = await prisma.roomPricing.findFirst({
        where: {
          roomId: room.id,
          type: pricing.type,
          startTime: pricing.startTime,
          endTime: pricing.endTime,
        },
      });

      if (existing) {
        await prisma.roomPricing.update({
          where: {
            id: existing.id,
          },
          data: {
            price: pricing.price,
            isActive: true,
          },
        });
      } else {
        await prisma.roomPricing.create({
          data: {
            roomId: room.id,
            ...pricing,
            isActive: true,
          },
        });
      }
    }
  }

  console.log("20 room beserta harga berhasil dibuat.");

  // =========================
  // 3. PRODUCT
  // =========================

  const products = [
    {
      name: "Air Mineral",
      capitalPrice: 2500,
      price: 5000,
      stock: 100,
      trackStock: true,
      useTax: true,
      useService: true,
    },
    {
      name: "Teh Botol",
      capitalPrice: 4000,
      price: 8000,
      stock: 50,
      trackStock: true,
      useTax: true,
      useService: true,
    },
    {
      name: "Kopi",
      capitalPrice: 5000,
      price: 12000,
      stock: 50,
      trackStock: true,
      useTax: true,
      useService: true,
    },
    {
      name: "Kentang Goreng",
      capitalPrice: 10000,
      price: 20000,
      stock: 30,
      trackStock: true,
      useTax: true,
      useService: true,
    },
    {
      name: "Mie Goreng",
      capitalPrice: 8000,
      price: 18000,
      stock: 30,
      trackStock: true,
      useTax: true,
      useService: true,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { name: product.name },
      update: {
        capitalPrice: product.capitalPrice,
        price: product.price,
        useTax: product.useTax,
        useService: product.useService,
      },
      create: product,
    });
  }

  console.log("Produk dibuat.");

  // =========================
  // 4. PACKAGE
  // =========================

  const packageDefinitions = [
    {
      name: "Paket Hemat",
      durationMinute: 60,
      price: 100000,
      items: [{ productName: "Air Mineral", quantity: 2 }],
    },
    {
      name: "Paket Couple",
      durationMinute: 120,
      price: 180000,
      items: [
        { productName: "Air Mineral", quantity: 2 },
        { productName: "Kentang Goreng", quantity: 1 },
      ],
    },
    {
      name: "Paket Family",
      durationMinute: 180,
      price: 300000,
      items: [
        { productName: "Air Mineral", quantity: 4 },
        { productName: "Mie Goreng", quantity: 2 },
      ],
    },
  ];

  for (const packageData of packageDefinitions) {
    let karaokePackage = await prisma.package.findFirst({
      where: { name: packageData.name },
    });

    if (karaokePackage) {
      karaokePackage = await prisma.package.update({
        where: { id: karaokePackage.id },
        data: {
          durationMinute: packageData.durationMinute,
          price: packageData.price,
          isActive: true,
        },
      });
    } else {
      karaokePackage = await prisma.package.create({
        data: {
          name: packageData.name,
          durationMinute: packageData.durationMinute,
          price: packageData.price,
          isActive: true,
        },
      });
    }

    for (const item of packageData.items) {
      const product = await prisma.product.findUnique({
        where: { name: item.productName },
      });

      if (!product) {
        throw new Error(`Produk ${item.productName} tidak ditemukan`);
      }

      await prisma.packageItem.upsert({
        where: {
          packageId_productId: {
            packageId: karaokePackage.id,
            productId: product.id,
          },
        },
        update: {
          quantity: item.quantity,
        },
        create: {
          packageId: karaokePackage.id,
          productId: product.id,
          quantity: item.quantity,
        },
      });
    }
  }

  console.log("Paket karaoke dibuat.");

  // =========================
  // 5. COMPANION
  // =========================

  const companions = [
    {
      name: "Companion 1",
      phone: "081234567801",
      priceHour: 50000,
    },
    {
      name: "Companion 2",
      phone: "081234567802",
      priceHour: 50000,
    },
    {
      name: "Companion 3",
      phone: "081234567803",
      priceHour: 75000,
    },
  ];

  for (const companionData of companions) {
    const existing = await prisma.companion.findFirst({
      where: { name: companionData.name },
    });

    if (existing) {
      await prisma.companion.update({
        where: { id: existing.id },
        data: {
          phone: companionData.phone,
          priceHour: companionData.priceHour,
          isActive: true,
        },
      });
    } else {
      await prisma.companion.create({
        data: {
          ...companionData,
          status: "AVAILABLE",
          isActive: true,
        },
      });
    }
  }

  console.log("Companion dibuat.");

  // =========================
  // 6. CHARGE SETTING
  // =========================

  const charges = [
    {
      name: "Service Charge",
      category: "SERVICE",
      value: 5,
      afterDiscount: true,
      isActive: true,
    },
    {
      name: "Tax",
      category: "TAX",
      value: 10,
      afterDiscount: true,
      isActive: true,
    },
  ];

  for (const charge of charges) {
    const existing = await prisma.chargeSetting.findFirst({
      where: {
        name: charge.name,
        category: charge.category,
      },
    });

    if (existing) {
      await prisma.chargeSetting.update({
        where: { id: existing.id },
        data: {
          value: charge.value,
          afterDiscount: charge.afterDiscount,
          isActive: true,
        },
      });
    } else {
      await prisma.chargeSetting.create({
        data: charge,
      });
    }
  }

  console.log("Charge pajak dan service dibuat.");
  console.log("Seed database selesai.");
}

main()
  .catch((error) => {
    console.error("Seed gagal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
