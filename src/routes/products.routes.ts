import { Router } from 'express'
import { ProductController } from '../controllers/ProductController'
import { authenticate } from '../middlewares/auth'

const router = Router()
const controller = new ProductController()

router.use(authenticate)

router.get('/', (req, res) => controller.list(req, res))
router.get('/:id', (req, res) => controller.getById(req, res))
router.post('/', (req, res) => controller.create(req, res))
router.patch('/:id', (req, res) => controller.update(req, res))
router.delete('/:id', (req, res) => controller.delete(req, res))

export { router as productRouter }
