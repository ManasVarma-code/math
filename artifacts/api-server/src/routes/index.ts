import { Router, type IRouter } from "express";
import healthRouter from "./health";
import equationPathRouter from "./equationpath";

const router: IRouter = Router();

router.use(healthRouter);
router.use(equationPathRouter);

export default router;
