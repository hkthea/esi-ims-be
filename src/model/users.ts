import { signer } from "../library/signer";
import USERSCH from "../schema/users";
import BaseUser from "./base_users";

const userModel = BaseUser(USERSCH, "SALT", signer);
export const {
    Login,
    changePassword,
    createDefaultUser,
    createUser,
    insert,
    paging,
    update,
    updateProfile,
} = userModel;

export default userModel;
