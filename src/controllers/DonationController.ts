import { Request, Response } from "express";

import { prisma } from "../config/prisma";

export class DonationController {
  async create(req: Request, res: Response) {
    const {
      amount,
      method,
      donorName,
      donorEmail,
      donorCpf,
      message,
      status,
    } = req.body;

    const donation = await prisma.donation.create({
      data: {
        amount,
        method,
        donorName,
        donorEmail,
        donorCpf,
        message,
        status,
      },
    });

    const admin = await prisma.user.findFirst({
      where: {
        role: "ADMIN",
      },
    });

    if (admin) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: "DONATION_RECEIVED",
          title: "Nova doação recebida",
          body: `${
            donorName || "Um apoiador"
          } realizou uma doação de R$ ${amount}.`,
        },
      });
    }

    return res.status(201).json(donation);
  }

  async findAll(req: Request, res: Response) {
    const donations = await prisma.donation.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json(donations);
  }
}