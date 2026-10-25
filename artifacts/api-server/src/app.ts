import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const handleError: ErrorRequestHandler = (error, req, res, _next) => {
  req.log.error({ error }, "Request failed");
  const status = error.status === 413 ? 413 : error.type === "entity.parse.failed" ? 400 : 502;
  res.status(status).json({ error: status === 413 ? "Request exceeds the 1 MB limit." : status === 400 ? "Request must contain valid JSON." : "The service returned an invalid result. Check the API terminal." });
};
app.use(handleError);

export default app;
