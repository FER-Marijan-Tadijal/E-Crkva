import express from "express";
import { ingestTelemetry } from "../controllers/telemetry.controller.js";

const router = express.Router();

router.post("/", ingestTelemetry);

export default router;
