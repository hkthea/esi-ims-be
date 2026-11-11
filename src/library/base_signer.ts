import jwt from 'jsonwebtoken';

export type DecodeFunction = (aToken: string) => any;
export type SignerFunction = (uData: any) => string;
export type RefreshTokenFunction = (uData: string) => string;
export type VerifyTokenFunction = (aToken: string) => boolean;

export default (privateKey, publicKey, signerOptions) => {
    const verifyToken = (aToken: string) => {
        return jwt.verify(aToken, publicKey, signerOptions);
    }

    const signer: SignerFunction = (uData: any) => {
        const result = jwt.sign(uData, privateKey, signerOptions);
        return result;
    }

    const decode: DecodeFunction = (aToken: string) => {
        try {
            return verifyToken(aToken) && jwt.decode(aToken, { complete: false });
        } catch (error) {
            return false;
        }
    }

    const refreshToken: RefreshTokenFunction = (aToken: string) => {
        const { aud, exp, iat, sub, ...uData } = decode(aToken);
        return uData && signer(uData);
    }

    return { verifyToken, signer, decode, refreshToken }
}
