import { Router } from 'express';
import { CtrlHandler, createCrudController } from './utils';
import AirlineModel from '../schema/airline';

const AirlineCtrl = Router();

// Lightweight list for dropdowns/caches (no paging).
AirlineCtrl.get('/cache', (req, res) => {
    CtrlHandler(req, res, async () => {
        return await AirlineModel.find(
            { deletedAt: null },
            'name prefix code iata icao country',
            { sort: { name: 1 } }
        );
    });
});

AirlineCtrl.use(
    '/',
    createCrudController(
        AirlineModel,
        0,
        ['name', 'prefix', 'code', 'iata', 'icao', 'country']
    )
);

export default AirlineCtrl;
