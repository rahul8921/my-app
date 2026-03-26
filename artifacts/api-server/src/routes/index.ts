import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import matchesRouter from "./matches";
import betsRouter from "./bets";
import adminRouter from "./admin";
import ridesRouter from "./rides";
import driverRouter from "./driver";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(matchesRouter);
router.use(betsRouter);
router.use(adminRouter);
router.use(ridesRouter);
router.use(driverRouter);

export default router;
