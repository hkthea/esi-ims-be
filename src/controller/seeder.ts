import {Router} from 'express';
import { CtrlHandler } from './utils';
import { createDefUser } from '../seeder/user';

const SeederCtrl=Router();

SeederCtrl.get('/user/:pass',(req, res)=>{
    CtrlHandler(req, res, async(body)=>{
        return await createDefUser(req.params.pass);
    });
});

export default SeederCtrl;