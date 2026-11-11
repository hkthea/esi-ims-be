import { Request } from 'express';
import LOGSCH from '../schema/activity_log';
import { ObjectId } from 'mongoose';

export const CreateRandomString = (len: number = 8, dict: string = '056789QWERTYUIOPqwertyopasdfghjklzxcvbnmASDFGHJKLZXCVBNM1234') => {
    let result = '';
    for (let iii = 0; iii < len; iii++) {
        const charAt = Math.floor(Math.random() * 1000) % dict.length;
        result = dict[charAt] + result;
    }
    return result;
}

const parseIps = (ips: any) => {
    if (Array.isArray(ips)) {
        return ips.length > 0 ? ips[ips.length - 1] : false;
    }
    if (!ips) return false;
    if (typeof ips === 'string') {
        const [ip_address] = ips.split(',');
        return ip_address;
    }
    return ips;
}

export const getIpAddr = (req: Request) => {
    const { headers, ip, hostname, ips } = req;
    return parseIps(headers['x-forwarded-for']) || parseIps(ips) || ip || hostname;
}

export const createLog = async (user_id: ObjectId, log: string, req: Request) => {
    const ip_address = getIpAddr(req);
    return await LOGSCH.create({ user_id, ip_address, log });
}
