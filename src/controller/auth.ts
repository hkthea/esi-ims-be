import { createAuthController } from './utils';
import UserModel from '../model/users';
import { decode, refreshToken } from '../library/signer';

const AuthCtrl = createAuthController(UserModel, decode, refreshToken, {});

export default AuthCtrl;