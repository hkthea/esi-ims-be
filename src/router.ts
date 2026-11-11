import { Router } from 'express';
import moment from 'moment';
import AuthCtrl from './controller/auth';
import AirlineCtrl from './controller/airline';
import SeederCtrl from './controller/seeder';
import { AuthMiddleware } from './controller/utils';
import { decode } from './library/signer';
import { getVersionHistory } from './library/version';

const router = Router();

router.get('/', (req, res) => {
    res.json({ error: 0, data: moment().unix() });
})

router.get('/version', (req, res) => {
    res.json({ error: 0, data: getVersionHistory() });
})

router.use('/auth', AuthCtrl);
router.use('/seeder', SeederCtrl);

router.use('/api/v1/airlines', AuthMiddleware(decode), AirlineCtrl);

export default router;
