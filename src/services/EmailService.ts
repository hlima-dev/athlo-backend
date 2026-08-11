import { Resend } from 'resend'
import { env } from '../config/env'

const resend = new Resend(env.RESEND_API_KEY)

export class EmailService {
  async sendPasswordReset(to: string, name: string, resetToken: string): Promise<void> {
    const resetUrl = `${env.APP_URL}/redefinir-senha?token=${resetToken}`

    await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: 'Redefinição de senha — ATHLO',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #0891b2;">Redefinição de senha</h2>
          <p>Olá, <strong>${name}</strong>.</p>
          <p>Recebemos uma solicitação para redefinir a senha da sua conta no ATHLO.</p>
          <p>Clique no botão abaixo para criar uma nova senha. O link expira em <strong>30 minutos</strong>.</p>
          <a href="${resetUrl}"
             style="display: inline-block; margin: 20px 0; padding: 12px 28px;
                    background: #0891b2; color: white; text-decoration: none;
                    border-radius: 8px; font-weight: bold;">
            Redefinir minha senha
          </a>
          <p style="color: #64748b; font-size: 13px;">
            Se você não solicitou a redefinição, ignore este e-mail.
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
          <p style="color: #94a3b8; font-size: 12px;">ATHLO — Gestão para pequenas e médias empresas</p>
        </div>
      `,
    })
  }

  async sendInvite(to: string, organizationName: string, inviteUrl: string): Promise<void> {
    await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: `Você foi convidado para ${organizationName} no ATHLO`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #0891b2;">Convite para ${organizationName}</h2>
          <p>Você foi convidado para fazer parte da equipe de <strong>${organizationName}</strong> no ATHLO.</p>
          <p>Clique no botão abaixo para criar sua conta. O convite expira em <strong>7 dias</strong>.</p>
          <a href="${inviteUrl}"
             style="display: inline-block; margin: 20px 0; padding: 12px 28px;
                    background: #0891b2; color: white; text-decoration: none;
                    border-radius: 8px; font-weight: bold;">
            Aceitar convite
          </a>
          <p style="color: #64748b; font-size: 13px;">
            Se você não esperava este convite, ignore este e-mail.
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
          <p style="color: #94a3b8; font-size: 12px;">ATHLO — Gestão para pequenas e médias empresas</p>
        </div>
      `,
    })
  }
}
