import webpush from 'web-push'
import { prisma } from '../config/prisma'
import { env } from '../config/env'

let configured = false

function ensureConfigured(): boolean {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false
  if (!configured) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
    configured = true
  }
  return true
}

interface PushPayload {
  title: string
  body: string
  url?: string
}

export class PushService {
  isEnabled(): boolean {
    return ensureConfigured()
  }

  async subscribe(
    userId: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ) {
    return prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, userAgent },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent,
      },
    })
  }

  async unsubscribe(endpoint: string) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint } })
  }

  // Manda a notificação para TODOS os dispositivos (navegadores) que o
  // usuário já ativou — pode ser o notebook e o celular ao mesmo tempo,
  // por exemplo. Remove sozinho as assinaturas que o navegador já
  // invalidou (usuário limpou dados, desinstalou, etc.).
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!ensureConfigured()) return

    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } })
    if (subscriptions.length === 0) return

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify(payload),
          )
        } catch (err) {
          const statusCode = (err as { statusCode?: number })?.statusCode
          if (statusCode === 404 || statusCode === 410) {
            // Assinatura morta (expirada/revogada no navegador) — limpa.
            await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
          } else {
            console.error('Erro ao enviar push notification:', err)
          }
        }
      }),
    )
  }
}
