/*
  This file is similar to a Spring Boot database configuration class.
  It reads the JDBC-style database URL from environment properties and
  instantiates the Prisma client, analogous to creating a DataSource or
  `EntityManagerFactory` bean in Spring.
*/
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

export function createPrismaClient() {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to connect Prisma to Postgres.");
  }

  const adapter = new PrismaPg(connectionString);

  return new PrismaClient({ adapter });
}
