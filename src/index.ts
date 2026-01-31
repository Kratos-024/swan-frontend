import startBot from "./controllers/WA_controller.js";
import { configDotenv } from "dotenv";

configDotenv({
  path: ".env",
});
if (process.env.MOBILE_NUMBER) {
  startBot(process.env.MOBILE_NUMBER);
}
