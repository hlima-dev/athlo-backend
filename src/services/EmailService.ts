import { Resend } from 'resend'
import { env } from '../config/env'

const resend = new Resend(env.RESEND_API_KEY)

export class EmailService {
  async sendPasswordReset(to: string, name: string, resetToken: string): Promise<void> {
    const resetUrl = `${env.APP_URL}/redefinir-senha?token=${resetToken}`

    await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: 'Redefinição de senha — ATHLO / ASDA',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #0891b2;">Redefinição de senha</h2>
          <p>Olá, <strong>${name}</strong>.</p>
          <p>Recebemos uma solicitação para redefinir a senha da sua conta no sistema ATHLO.</p>
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
          <p style="color: #94a3b8; font-size: 12px;">ONG ASDA Sorocaba — Sistema ATHLO</p>
        </div>
      `,
    })
  }
}
