import { prisma } from "../src/lib/db/config"
import { seedNotificationDefaults } from "../src/features/notifications/server/seed"

async function seed() {
  console.log("Seeding notification defaults (disciplines + global rules)...")
  const result = await seedNotificationDefaults(prisma)
  console.log(`✅ Disciplines ensured: ${result.disciplines}`)
  console.log(`✅ Global rules ensured: ${result.rules}`)
  console.log("Done.")
}

seed()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
