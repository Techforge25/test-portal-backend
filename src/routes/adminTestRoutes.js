const express = require("express");
const {
  createTest,
  listTests,
  getTestById,
  updateTest,
  updateTestStatus,
  deleteTest,
} = require("../controllers/adminTestController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(auth, requireRole("admin"));

router.get("/tests", listTests);
router.post("/tests", createTest);
router.get("/tests/:id", getTestById);
router.patch("/tests/:id", updateTest);
router.patch("/tests/:id/status", updateTestStatus);
router.delete("/tests/:id", deleteTest);

module.exports = router;
