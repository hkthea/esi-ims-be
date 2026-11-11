import BaseSigner from './base_signer';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Keys can come from base64 env vars (production/Docker) or from ./key/*.pem (local dev).
const readEnvKey = (name: string): string => {
    const value = process.env[name];
    if (!value) return '';
    if (value.includes('BEGIN')) return value.replace(/\\n/g, '\n');
    return Buffer.from(value, 'base64').toString('utf-8');
};

const readFileKey = (filename: string): string => {
    const filePath = path.resolve(process.cwd(), 'key', filename);
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
};

const privateKey = readEnvKey('PRIVATE_KEY') || readFileKey('private.pem');
const publicKey = readEnvKey('PUBLIC_KEY') || readFileKey('public.pem');
if (!privateKey || !publicKey) {
    throw new Error(
        "No Key Found: set PRIVATE_KEY/PUBLIC_KEY (base64) or run generateKey.sh to create key/private.pem and key/public.pem"
    );
}
const signerOptions = { expiresIn: '8h', audience: 'HKNet', subject: 'hknet@edifly-si.sys', algorithm: 'RS256' };

const sign = BaseSigner(privateKey, publicKey, signerOptions);

export const { decode, refreshToken, signer, verifyToken } = sign;