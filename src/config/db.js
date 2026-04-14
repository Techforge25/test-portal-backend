const mongoose = require("mongoose");
const { logger } = require("../utils/logger");
const { getRequiredEnv } = require("./env");

async function connectDB() {
  const mongoUri = getRequiredEnv("MONGODB_URI");

  await mongoose.connect(mongoUri);
  logger.info("MongoDB connected");
}

module.exports = { connectDB };
