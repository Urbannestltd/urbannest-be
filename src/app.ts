import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import { requestLogger } from "./middlewares/requestLogger";
import { notFoundHandler } from "./middlewares/notFoundHandler";
import { errorHandler } from "./middlewares/errorHandler";
import swaggerUi from "swagger-ui-express";
import { RegisterRoutes } from "./build/routes";
import swaggerDocument from "./build/swagger.json";

const app: Application = express();

app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(requestLogger);

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

RegisterRoutes(app);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
