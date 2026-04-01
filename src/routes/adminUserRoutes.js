const express = require("express");
const { auth, requireRole } = require("../middleware/auth");
const { listAdmins, createSubAdmin } = require("../controllers/adminUserController");

const router = express.Router();

router.use(auth, requireRole("admin"));

router.get("/users", listAdmins);
router.post("/users", createSubAdmin);

module.exports = router;
