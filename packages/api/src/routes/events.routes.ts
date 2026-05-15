import { Router } from "express";
import { getEventsController } from "../controllers/events.controller";

const router = Router();

router.get("/", getEventsController);

export default router;
