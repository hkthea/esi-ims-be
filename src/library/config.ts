import os from 'os';
import { cpu } from 'systeminformation';
import { CreateRandomString } from './utils';
import moment from 'moment';
import dotenv from 'dotenv';
dotenv.config();
export interface tdatabase {
    connection: string
}

interface tserver {
    port: number
    bind: string
}

interface tconfig {
    database: tdatabase
    server: tserver
    image_path: string
    salt: string
    isStaging: boolean
    homePath: string
    appName: string
    podName: string
    version: string
    buildTime: string
}

const getHomeDir = (): string => os.homedir();

export const getOsPlatform = (): string => os.platform()

export const getCPU = async () => {
    return (await cpu());
}

const getDefaultConfig = (): tconfig => {
    return {
        database: {
            connection: ''
        },
        server: {
            bind: '0.0.0.0',
            port: 11611
        },
        image_path: '/images/',
        salt: CreateRandomString(24),
        isStaging: false,
        homePath: getHomeDir(),
        appName: 'appname',
        podName: CreateRandomString(6),
        version: '0.0.0',
        buildTime: moment().date().toString()
    }
}

const getEnv = (name: string, defValue: string) => {
    const val = process.env[name] || defValue;
    return val;
}

export const getConfigFile = (): tconfig => {
    const home = getHomeDir();
    const appName = process.env.NAME || 'appname';
    const defCfg = getDefaultConfig();
    const connection = getEnv('DATABASE_CONNECTION', 'mongodb://localhost:27017/default');
    const salt = getEnv('SALT', CreateRandomString(24));
    const podName = getEnv('POD_NAME', CreateRandomString(6));
    const version = getEnv('VERSION', '0.0.0');
    const buildTime = getEnv('BUILD_TIME', moment().toISOString());
    const config = {
        homePath: home,
        appName,
        database: {
            connection
        },
        salt,
        podName,
        version,
        buildTime
    }
    return { ...defCfg, ...config };
}