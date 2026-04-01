const express = require("express");

const adminTestRoutes = require("./adminTestRoutes");
const adminUserRoutes = require("./adminUserRoutes");
const adminInsightsRoutes = require("./adminInsightsRoutes");
const adminSettingsRoutes = require("./adminSettingsRoutes");

const router = express.Router();

router.use(adminTestRoutes);
router.use(adminUserRoutes);
router.use(adminInsightsRoutes);
router.use(adminSettingsRoutes);

module.exports = router;
