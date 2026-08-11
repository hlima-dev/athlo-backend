import { Router } from 'express'

import { authRouter } from './auth.routes'
import { organizationRouter } from './organization.routes'
import { planRouter } from './plans.routes'
import { inviteRouter } from './invites.routes'
import { contactRouter } from './contacts.routes'
import { productRouter } from './products.routes'
import { invoiceRouter } from './invoices.routes'
import { eventRouter } from './events.routes'
import { notificationRouter } from './notifications.routes'
import { dashboardRoutes } from './dashboard.routes'

const router = Router()

router.use('/auth', authRouter)
router.use('/organization', organizationRouter)
router.use('/plans', planRouter)
router.use('/invites', inviteRouter)
router.use('/contacts', contactRouter)
router.use('/products', productRouter)
router.use('/invoices', invoiceRouter)
router.use('/events', eventRouter)
router.use('/notifications', notificationRouter)
router.use('/dashboard', dashboardRoutes)

export { router }
