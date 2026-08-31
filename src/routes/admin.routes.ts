import { Router } from 'express'
import { AdminController } from '../controllers/AdminController'
import { ErrorLogController } from '../controllers/ErrorLogController'
import { authenticate } from '../middlewares/auth'
import { requirePlatformAdmin } from '../middlewares/requirePlatformAdmin'

const router = Router()
const controller = new AdminController()
const errorLogController = new ErrorLogController()

router.use(authenticate, requirePlatformAdmin)

router.get('/overview', (req, res) => controller.overview(req, res))
router.get('/organizations', (req, res) => controller.listOrganizations(req, res))
router.get('/organizations/:id', (req, res) => controller.getOrganization(req, res))
router.patch('/organizations/:id/status', (req, res) => controller.suspendOrganization(req, res))

router.get('/errors', (req, res) => errorLogController.list(req, res))
router.get('/errors/summary', (req, res) => errorLogController.summary(req, res))
router.patch('/errors/:id/resolve', (req, res) => errorLogController.resolve(req, res))

export { router as adminRouter }
