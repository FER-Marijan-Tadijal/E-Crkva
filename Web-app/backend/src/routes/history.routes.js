import express from "express";
import {
  getHistoryData,
  getLatestData,
} from "../controllers/history.controller.js";

const router = express.Router();

router.get("/:deviceId", getHistoryData);
router.get("/:deviceId/latest", getLatestData);

export default router;
