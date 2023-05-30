import { Router } from 'express';

import Cache from './../providers/Cache';

import HomeController from '../controllers/Home';

const router = Router();
const cache = Cache.cache;

router.get('/', cache(10), HomeController.index);

export default router;
