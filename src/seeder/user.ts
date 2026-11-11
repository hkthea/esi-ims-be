// import USRSCH from '../schema/users';
import { createDefaultUser } from "../model/users";

export const createDefUser = async (password) => {
    return await createDefaultUser(password);
}