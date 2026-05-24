import { Request, Response } from "express";

import { prisma } from "../config/prisma";

export class DashboardController {
  async index(req: Request, res: Response) {
    const [athletes, users, events, donations] =
      await Promise.all([
        prisma.athlete.count(),
        prisma.user.count(),
        prisma.event.count(),
        prisma.donation.aggregate({
          _sum: {
            amount: true,
          },
        }),
      ]);

    const totalDonations =
      Number(donations._sum.amount) || 0;

    const dashboardData = {
      athletes,
      users,
      events,
      donations: totalDonations,

      growthData: [
        { month: "Jan", atletas: 20 },
        { month: "Fev", atletas: 35 },
        { month: "Mar", atletas: 52 },
        { month: "Abr", atletas: 78 },
        { month: "Mai", atletas: athletes },
      ],

      donationData: [
        { month: "Jan", valor: 1200 },
        { month: "Fev", valor: 2400 },
        { month: "Mar", valor: 3800 },
        { month: "Abr", valor: 6100 },
        { month: "Mai", valor: totalDonations },
      ],
    };

    return res.json(dashboardData);
  }
}