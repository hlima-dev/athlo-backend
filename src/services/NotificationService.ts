import { prisma } from '../config/prisma'
import { PushService } from './PushService'
import { NotificationType } from '@prisma/client'

const pushService = new PushService()

interface NotifyInput {
  userId: string
  type?: NotificationType
  title: string
  body: string
  url?: string
  data?: Record<string, unknown>
}

export class NotificationService {
  // Cria a notificação dentro do sistema (sino) e, se o usuário tiver
  // algum dispositivo com push ativado, manda a notificação push também
  // — as duas juntas, sempre pelo mesmo lugar, pra nunca ficar uma sem
  // a outra.
  async notify(input: NotifyInput) {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type ?? NotificationType.INFO,
        title: input.title,
        body: input.body,
        data: input.data ? JSON.stringify(input.data) : undefined,
        sentAt: new Date(),
      },
    })

    await pushService.sendToUser(input.userId, {
      title: input.title,
      body: input.body,
      url: input.url,
    })

    return notification
  }
}
