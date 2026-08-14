import { Resend } from 'resend'
import { env } from '../config/env'

const resend = new Resend(env.RESEND_API_KEY)

function layout(title: string, bodyHtml: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #0891b2;">${title}</h2>
      ${bodyHtml}
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
      <p style="color: #94a3b8; font-size: 12px;">ATHLO — Gestão para pequenas e médias empresas</p>
    </div>
  `
}

function button(url: string, label: string): string {
  return `
    <a href="${url}"
       style="display: inline-block; margin: 20px 0; padding: 12px 28px;
              background: #0891b2; color: white; text-decoration: none;
              border-radius: 8px; font-weight: bold;">
      ${label}
    </a>
  `
}

export class EmailService {
  async sendPasswordReset(to: string, name: string, resetToken: string): Promise<void> {
    const resetUrl = `${env.APP_URL}/redefinir-senha?token=${resetToken}`

    await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: 'Redefinição de senha — ATHLO',
      html: layout(
        'Redefinição de senha',
        `
          <p>Olá, <strong>${name}</strong>.</p>
          <p>Recebemos uma solicitação para redefinir a senha da sua conta no ATHLO.</p>
          <p>Clique no botão abaixo para criar uma nova senha. O link expira em <strong>30 minutos</strong>.</p>
          ${button(resetUrl, 'Redefinir minha senha')}
          <p style="color: #64748b; font-size: 13px;">
            Se você não solicitou a redefinição, ignore este e-mail.
          </p>
        `,
      ),
    })
  }

  async sendInvite(to: string, organizationName: string, inviteUrl: string): Promise<void> {
    await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: `Você foi convidado para ${organizationName} no ATHLO`,
      html: layout(
        `Convite para ${organizationName}`,
        `
          <p>Você foi convidado para fazer parte da equipe de <strong>${organizationName}</strong> no ATHLO.</p>
          <p>Clique no botão abaixo para criar sua conta. O convite expira em <strong>7 dias</strong>.</p>
          ${button(inviteUrl, 'Aceitar convite')}
          <p style="color: #64748b; font-size: 13px;">
            Se você não esperava este convite, ignore este e-mail.
          </p>
        `,
      ),
    })
  }

  async sendEmailVerification(to: string, name: string, token: string): Promise<void> {
    const verifyUrl = `${env.APP_URL}/verificar-email?token=${token}`

    await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: 'Confirme seu e-mail — ATHLO',
      html: layout(
        'Confirme seu e-mail',
        `
          <p>Olá, <strong>${name}</strong>.</p>
          <p>Confirme seu e-mail para garantir o acesso à sua conta no ATHLO.</p>
          ${button(verifyUrl, 'Confirmar meu e-mail')}
          <p style="color: #64748b; font-size: 13px;">
            Se você não criou esta conta, ignore este e-mail.
          </p>
        `,
      ),
    })
  }

  async sendInvoiceDueReminder(
    to: string,
    name: string,
    description: string,
    amountFormatted: string,
    dueDateFormatted: string,
  ): Promise<void> {
    await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: `Fatura a vencer: ${description} — ATHLO`,
      html: layout(
        'Fatura a vencer em breve',
        `
          <p>Olá, <strong>${name}</strong>.</p>
          <p>A fatura <strong>${description}</strong>, no valor de <strong>${amountFormatted}</strong>,
             vence em <strong>${dueDateFormatted}</strong>.</p>
          ${button(`${env.APP_URL}/financeiro`, 'Ver no ATHLO')}
        `,
      ),
    })
  }

  async sendOrderStatusUpdate(
    to: string,
    name: string,
    orderLabel: string,
    statusLabel: string,
  ): Promise<void> {
    await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: `Pedido atualizado: ${statusLabel} — ATHLO`,
      html: layout(
        'Atualização de pedido',
        `
          <p>Olá, <strong>${name}</strong>.</p>
          <p>O pedido <strong>${orderLabel}</strong> agora está com status <strong>${statusLabel}</strong>.</p>
          ${button(`${env.APP_URL}/pedidos`, 'Ver no ATHLO')}
        `,
      ),
    })
  }
}
