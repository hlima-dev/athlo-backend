import { Router } from 'express'

import { authRouter } from './auth.routes'
import { athleteRouter } from './athletes.routes'
import { eventRouter } from './events.routes'
import { trainingRouter } from './trainings.routes'
import { donationRouter } from './donations.routes'
import { notificationRouter } from './notifications.routes'
import { dashboardRoutes } from './dashboard.routes'

const router = Router()

router.use('/auth', authRouter)
router.use('/athletes', athleteRouter)
router.use('/events', eventRouter)
router.use('/trainings', trainingRouter)
router.use('/donations', donationRouter)
router.use('/notifications', notificationRouter)
router.use('/dashboard', dashboardRoutes)

export { router }