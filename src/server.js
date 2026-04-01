require("dotenv").config();
const app = require("./app");
const { connectDB } = require("./config/db");
const { bootstrapSuperAdmin } = require("./config/bootstrapSuperAdmin");
const { startPasscodeRotator } = require("./jobs/passcodeRotator");
const { logger } = require("./utils/logger");

const port = Number(process.env.PORT || 5000);
const host = process.env.HOST || "0.0.0.0";

async function start() {
  try {
    await connectDB();
    await bootstrapSuperAdmin();
    await startPasscodeRotator();
    app.listen(port, host, () => {
      logger.info("Backend running", { url: `http://${host}:${port}` });
    });
  } catch (error) {
    logger.error("Failed to start backend", { message: error.message });
    process.exit(1);
  }
}

start();
