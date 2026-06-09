import { Router } from 'express'
import { DashboardController } from '../controllers/DashboardController'
import { authenticate } from '../middlewares/auth'

const dashboardRoutes = Router()
const dashboardController = new DashboardController()

dashboardRoutes.get('/', authenticate, (req, res) => dashboardController.index(req, res))

export { dashboardRoutes }
