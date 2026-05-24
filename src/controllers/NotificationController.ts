import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { successResponse, getPagination, paginate } from '../utils/pagination'
import { NotificationType } from '@prisma/client'

const createNotificationSchema = z.object({
  userId: z.string().cuid(),
  type: z.nativeEnum(NotificationType).default(NotificationType.INFO),
  title: z.string().min(1),
  body: z.string().min(1),
  data: z.record(z.unknown()).optional(),
})

export class NotificationController {
  async create(req: Request, res: Response): Promise<void> {
    const { data: extraData, ...rest } = createNotificationSchema.parse(req.body)

    const notification = await prisma.notification.create({
      data: {
        ...rest,
        data: extraData ? JSON.stringify(extraData) : undefined,
      },
    })

    res.status(201).json(successResponse(notification))
  }

  async listMine(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)
    const unreadOnly = req.query.unread === 'true'

    const where = {
      userId: req.user!.id,
      ...(unreadOnly && { readAt: null }),
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
    ])

    res.status(200).json(successResponse(paginate(notifications, total, pagination)))
  }

  async markRead(req: Request, res: Response): Promise<void> {
    const notification = await prisma.notification.update({
      where: { id: String(req.params.id) },
      data: { readAt: new Date() },
    })
    res.status(200).json(successResponse(notification))
  }

  async markAllRead(req: Request, res: Response): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null },
      data: { readAt: new Date() },
    })
    res.status(200).json(successResponse(null, 'Todas as notificações marcadas como lidas'))
  }

  async unreadCount(req: Request, res: Response): Promise<void> {
    const count = await prisma.notification.count({
      where: { userId: req.user!.id, readAt: null },
    })
    res.status(200).json(successResponse({ count }))
  }
}
