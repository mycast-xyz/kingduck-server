import { Router } from 'express';
import * as controller from './controller';

const router = Router();

router.get('/list', controller.getList);
router.get('/:slug', controller.getDetail);

export default router;
