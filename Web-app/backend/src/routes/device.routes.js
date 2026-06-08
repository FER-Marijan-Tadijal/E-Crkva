import express from "express";
import { getLatestDeviceTelemetry } from "../controllers/device.controller.js";

const router = express.Router();

router.get("/:deviceId/latest", getLatestDeviceTelemetry);

export default router;
