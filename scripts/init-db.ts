import { config } from "dotenv"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const env = process.env.NODE_ENV || "development"
config({ path: `.env.${env}` })

const prisma = new PrismaClient()

async function main() {
  console.log(`Initializing database in ${env} mode...`)

  const existingRoot = await prisma.user.findUnique({
    where: { username: "admin" },
  })

  if (!existingRoot) {
    const hashedPassword = await bcrypt.hash("admin123", 10)
    await prisma.user.create({
      data: {
        username: "admin",
        email: "admin@example.com",
        password: hashedPassword,
        role: "ROOT",
      },
    })
    console.log("Created root user: admin / admin123")
  } else {
    console.log("Root user already exists")
  }

  const existingStaff = await prisma.user.findUnique({
    where: { username: "user" },
  })

  if (!existingStaff) {
    const hashedPassword = await bcrypt.hash("user123", 10)
    await prisma.user.create({
      data: {
        username: "user",
        email: "user@example.com",
        password: hashedPassword,
        role: "STAFF",
      },
    })
    console.log("Created staff user: user / user123")
  } else {
    console.log("Staff user already exists")
  }

  console.log("Database initialization complete!")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
