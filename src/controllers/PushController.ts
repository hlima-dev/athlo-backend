import { Request, Response } from 'express'
import { z } from 'zod'
import { PushService } from '../services/PushService'
import { env } from '../config/env'
import { successResponse } from '../utils/pagination'

const pushService = new PushService()

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
})

export class PushController {
  async publicKey(req: Request, res: Response): Promise<void> {
    res.status(200).json(
      successResponse({
        publicKey: env.VAPID_PUBLIC_KEY ?? null,
        enabled: pushService.isEnabled(),
      }),
    )
  }

  async subscribe(req: Request, res: Response): Promise<void> {
    const data = subscribeSchema.parse(req.body)
    await pushService.subscribe(req.user!.id, data, req.headers['user-agent'])
    res.status(201).json(successResponse(null, 'Notificações push ativadas neste dispositivo'))
  }

  async unsubscribe(req: Request, res: Response): Promise<void> {
    const { endpoint } = unsubscribeSchema.parse(req.body)
    await pushService.unsubscribe(endpoint)
    res.status(200).json(successResponse(null, 'Notificações push desativadas neste dispositivo'))
  }
}
