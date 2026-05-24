import { Router } from "express";

import { DonationController } from "../controllers/DonationController";
import { authenticate } from "../middlewares/auth";

const donationRouter = Router();
const controller = new DonationController();

donationRouter.post("/", authenticate, (req, res) => {
  return controller.create(req, res);
});

donationRouter.get("/", authenticate, (req, res) => {
  return controller.findAll(req, res);
});

export { donationRouter };