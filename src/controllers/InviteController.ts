import { Request, Response } from 'express'
import { z } from 'zod'

import { InviteService } from '../services/InviteService'
import { successResponse } from '../utils/pagination'
import { OrgRole } from '@prisma/client'

const inviteService = new InviteService()

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(OrgRole).optional(),
})

export class InviteController {
  async create(req: Request, res: Response): Promise<void> {
    const data = createInviteSchema.parse(req.body)
    const invite = await inviteService.create(req.user!.organizationId, req.user!.id, data)
    res.status(201).json(successResponse(invite, 'Convite enviado com sucesso'))
  }

  async list(req: Request, res: Response): Promise<void> {
    const invites = await inviteService.findAll(req.user!.organizationId)
    res.status(200).json(successResponse(invites))
  }

  async revoke(req: Request, res: Response): Promise<void> {
    await inviteService.revoke(req.user!.organizationId, String(req.params.id))
    res.status(204).send()
  }
}
