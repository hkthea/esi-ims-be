import { NextFunction, Request, Response, Router } from "express";
import m, { Model } from "mongoose";
import { createModel } from "../model/utils";
import moment from "moment";
import { DecodeFunction, RefreshTokenFunction } from "../library/base_signer";
import { getConfigFile } from "../library/config";
import { CreateRandomString, createLog } from "../library/utils";
import { tUserIntf } from "../model/base_users";

export const AuthMiddleware =
    (decode: DecodeFunction) =>
        (req: Request, res: Response, next: NextFunction) => {
            const authHeader: string = (process.env.AUTHHEADER || "srawungtoken").toLowerCase();
            const bearer = req.headers.authorization;
            const bearerToken =
                typeof bearer === "string" && bearer.toLowerCase().startsWith("bearer ")
                    ? bearer.slice(7).trim()
                    : "";
            const aToken =
                req.headers[authHeader] ||
                bearerToken ||
                (typeof req.query?.token === "string" ? req.query.token : "");
            if (!aToken) {
                res.json({ error: 403, message: "Forbidden!" });
            } else {
                const start = new Date().getTime();
                res.set("before-token-timestamps", `${start}`);
                const uData = decode(`${aToken}`);
                if (!uData) {
                    res.json({
                        error: 401,
                        message: "Auth Token Invalid or Expired!",
                    });
                } else {
                    res.locals.udata = { ...uData };
                    res.locals.token = aToken;
                    const end = new Date().getTime();
                    res.set("after-token-timestamps", `${end}`);
                    res.set("token-time-ms", `${end - start}`);
                    next();
                }
            }
        };

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toPositiveInt = (value: string, fallback: number) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseJsonBody = (value: string) => {
    if (!value) return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        throw new Error("Invalid search parameter!");
    }
};

export const RestApiMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    next();
};

type tCallbackHandler = (body: any) => any;

export const CtrlHandler = async (
    req: Request,
    res: Response,
    callback: tCallbackHandler,
    httpErrorCode: boolean = false
) => {
    const jres = {
        error: 0,
        data: [],
        message: "",
        stack: {},
        errorName: "",
    };
    const start = new Date().getTime();
    res.set("before-exec-timestamps", `${start}`);
    try {
        jres.data = await callback(req.body);
    } catch (error) {
        if (!httpErrorCode) {
            jres.error = 500;
            jres.message = error.message;
            jres.errorName = error.name;
        } else {
            res.status(500).send(error.message);
        }
    }
    if (jres.data !== undefined) {
        const end = new Date().getTime();
        res.set("after-exec-timestamps", `${end}`);
        res.set("execution-time-ms", `${end - start}`);
        res.json(jres);
    }
};
type tBeforeSaveData = (
    data: object,
    level: number,
    uid: string,
    req: Request
) => Promise<object>;
type tBeforeRead = (
    search: string,
    search2: string,
    filter: object
) => Promise<object>;
type tAfterSave = (data: object) => Promise<object>;
type tBeforeInq = (data: object, userData?: object) => Promise<object>;
type tBeforeDetailResp = (
    data: object,
    isMultiple: boolean,
    uid: string
) => Promise<object>;
type tAddAuthQry = (udata: object) => Promise<object>;
type tAfterInq = (inqData: object) => Promise<object>;

export interface tCrudFunctionCallback {
    beforeSaveData?: tBeforeSaveData;
    beforeRead?: tBeforeRead;
    afterSave?: tAfterSave;
    beforeInq?: tBeforeInq;
    beforeDetailResponse?: tBeforeDetailResp;
    addAuthQry?: tAddAuthQry;
    afterInq?: tAfterInq;
}

export const createCrudController = (
    schema: Model<any>,
    level: number = 0,
    defSearch: Array<string> = [],
    sort: object = { _id: -1 },
    projector: string = "",
    initialFilter: object = {},
    crudCallback?: tCrudFunctionCallback
): Router => {
    const rtr = Router();
    const {
        addAuthQry,
        afterInq,
        afterSave,
        beforeDetailResponse,
        beforeInq,
        beforeRead,
        beforeSaveData,
    } = crudCallback || {};
    const { insert, reqPaging, update, remove } = createModel(schema);
    // Soft-deleted documents are hidden automatically when the schema supports it.
    const activeFilter = schema.schema.path("deletedAt") ? { deletedAt: null } : {};
    rtr.get("/", (req, res) => {
        CtrlHandler(req, res, async () => {
            const search = req.query.search as string;
            const search2 = req.query.search2 as string;
            const page = toPositiveInt(req.query.page as string, 1);
            const perPage = toPositiveInt(req.query.perPage as string, 10);
            let filter: Record<string, unknown> = { ...initialFilter, ...activeFilter };
            if (!!beforeRead && typeof beforeRead === "function") {
                filter = (await beforeRead(search, search2, filter)) as Record<string, unknown>;
            } else {
                if (search) {
                    const o = [];
                    const r = new RegExp(escapeRegex(search), "i");
                    for (let iii = 0; iii < defSearch.length; iii++) {
                        const f = defSearch[iii];
                        o.push({ [f]: r });
                    }
                    filter = { ...filter, $or: o };
                }
                if (search2) {
                    const f = parseJsonBody(search2);
                    const regexFilter = {};
                    for (const key in f) {
                        if (Object.hasOwnProperty.call(f, key)) {
                            const value = f[key];
                            if (value === undefined || value === null || value === "") continue;
                            regexFilter[key] = new RegExp(escapeRegex(`${value}`), "i");
                        }
                    }

                    filter = { ...filter, ...regexFilter };
                }
            }
            return await reqPaging(schema, page, perPage, filter, sort, projector);
        });
    });

    rtr.post("/", (req, res) => {
        CtrlHandler(req, res, async (body) => {
            const { _id: uid } = res.locals.udata || {};
            let data = body;
            if (!!beforeSaveData && typeof beforeSaveData === "function") {
                data = await beforeSaveData(data, level, uid, req);
            }

            const { _id } = data;
            if (_id) {
                let saved = await update(data, _id);
                if (!saved) throw new Error("Data not found!");
                if (!!afterSave && typeof afterSave === "function") {
                    saved = await afterSave(saved);
                }
                return saved;
            }
            let saved = await insert(data, uid);
            if (!!afterSave && typeof afterSave === "function") {
                saved = await afterSave(saved);
            }
            return saved;
        });
    });

    rtr.delete("/:id", (req, res) => {
        CtrlHandler(req, res, async () => {
            const { id } = req.params;
            const deleted = await remove(id);
            if (!deleted) throw new Error("Data not found!");
            return { _id: id };
        });
    });

    const cleanQry = (qry: Record<string, unknown>) => {
        const result = {};
        for (const key in qry) {
            if (Object.hasOwnProperty.call(qry, key)) {
                const v = qry[key];
                if (key.indexOf("$") >= 0) continue;
                if (key === "timestamp") continue;
                result[key] = v;
            }
        }
        return result;
    };

    rtr.get("/pagination", (req, res) => {
        CtrlHandler(req, res, async () => {
            const search = req.query.search as string;
            const page = toPositiveInt(req.query.page as string, 1);
            const perPage = toPositiveInt(req.query.perPage as string, 10);

            const offset = (page - 1) * perPage;

            const authQry = addAuthQry
                ? await addAuthQry(res.locals.udata || {})
                : {};
            let filter: Record<string, unknown> = { ...initialFilter, ...activeFilter, ...authQry };

            const jsSearch = parseJsonBody(search);
            const f = cleanQry(jsSearch);
            const query = f;
            const qry = {};
            for (const key in query) {
                if (Object.hasOwnProperty.call(query, key)) {
                    const v = query[key];
                    if (v) qry[key] = v;
                }
            }
            const inq = (beforeInq && (await beforeInq(qry))) || qry;
            filter = { ...filter, ...inq };
            if (filter["$text"]) {
                const iData = await schema.find(
                    filter,
                    { score: { $meta: "textScore" } },
                    {
                        limit: perPage,
                        skip: offset,
                        sort: { score: { $meta: "textScore" } },
                    }
                );
                const data =
                    (!!afterInq &&
                        typeof afterInq === "function" &&
                        (await afterInq(iData))) ||
                    iData;
                const total = await schema.estimatedDocumentCount(filter);
                const subTotal = await schema.countDocuments(filter);
                return { data, subTotal, total };
            }
            const iData = await schema.find(filter, "", {
                limit: perPage,
                skip: offset,
                sort,
            });
            const data =
                (!!afterInq &&
                    typeof afterInq === "function" &&
                    (await afterInq(iData))) ||
                iData;
            const total = await schema.estimatedDocumentCount(filter);
            if (JSON.stringify(filter) !== "{}") {
                const subTotal = await schema.countDocuments(filter);
                return { data, subTotal, total };
            }
            return { data, subTotal: total, total };
        });
    });

    rtr.get("/inquiry", (req, res) => {
        CtrlHandler(req, res, async () => {
            const search = req.query.search as string;
            let filter: Record<string, unknown> = { ...initialFilter, ...activeFilter };
            const f = parseJsonBody(search);
            const qry = f;
            const inq =
                (!!beforeInq &&
                    typeof beforeInq === "function" &&
                    (await beforeInq(qry, res.locals.udata))) ||
                qry;
            filter = { ...filter, ...inq };
            const data = await schema.find(filter, "", { sort });
            return (
                (!!afterInq &&
                    typeof afterInq === "function" &&
                    (await afterInq(data))) ||
                data
            );
        });
    });

    rtr.get("/detail/:id", (req, res) => {
        CtrlHandler(req, res, async () => {
            const { id } = req.params;
            const { _id: uid } = res.locals.udata || {};
            const data = await schema.findOne({ _id: id, ...initialFilter, ...activeFilter });
            const resp =
                (!!beforeDetailResponse &&
                    typeof beforeDetailResponse === "function" &&
                    (await beforeDetailResponse(data, false, uid))) ||
                data;
            return resp;
        });
    });

    rtr.get("/detail/:field/:id", (req, res) => {
        CtrlHandler(req, res, async () => {
            const { id, field } = req.params;
            const { _id: uid } = res.locals.udata || {};
            if (!m.Types.ObjectId.isValid(id)) throw new Error("Invalid id!");
            const value = new m.Types.ObjectId(id);
            const data = await schema.find({ [field]: value, ...initialFilter, ...activeFilter }, "", {
                sort: { _id: -1 },
            });
            const resp =
                (!!beforeDetailResponse &&
                    typeof beforeDetailResponse === "function" &&
                    (await beforeDetailResponse(data, true, uid))) ||
                data;
            return resp;
        });
    });

    return rtr;
};

export const generateUniqueName = () => {
    return `${moment().unix()}_${CreateRandomString(10)}`;
};

export const createFile = (file) => {
    const { name } = file;
    const frag = name.split(".");
    const ext = frag.pop();
    const nm = frag.join(".");
    const imagePath = getConfigFile().image_path;
    const dir = imagePath;
    const filename = generateUniqueName() + "_" + nm + "." + ext;
    file.mv(dir + "/" + filename);
    return filename;
};

export interface tColumn {
    title: string;
    name: string;
    field: string;
    type: string;
    align?: string;
    format?: string;
}
type tGetReportFunc = (
    schema: Model<any>,
    req: Request,
    res: Response,
    first_date: string,
    last_date?: string
) => Promise<object>;

export const createReportCtrl = (
    schema: Model<any>,
    type: string = "daily",
    columns: Array<tColumn> = [],
    getReport: tGetReportFunc
) => {
    const rtr = Router();
    const header = columns.map(({ title }) => title);
    const fields = columns.map(({ title, ...rest }) => ({ ...rest }));
    if (type === "daily") {
        rtr.get("/:first_date/:last_date", (req, res) => {
            CtrlHandler(req, res, async (body) => {
                const { first_date, last_date } = req.params;
                const data = await getReport(
                    schema,
                    req,
                    res,
                    first_date,
                    last_date
                );
                return { data, header, fields };
            });
        });
    } else {
        rtr.get("/:month", (req, res) => {
            CtrlHandler(req, res, async (body) => {
                const { month } = req.params;
                if (typeof getReport === "function") {
                    const data = await getReport(schema, req, res, month);
                    return { data, header, fields };
                }
                throw new Error("Report callback function not found!");
            });
        });
    }

    return rtr;
};

export const createAuthController = (
    model: tUserIntf,
    decoder: DecodeFunction,
    refreshToken: RefreshTokenFunction,
    CaptchaCache: any
) => {
    const {
        changePassword,
        createDefaultUser,
        Login,
        updateProfile,
        updateLastLogin,
    } = model;
    const rtr = Router();

    rtr.post("/login", (req, res) => {
        CtrlHandler(req, res, async (body) => {
            const { username, password } = body;
            try {
                const [token, udata] = await Login(username, password);

                await updateLastLogin(udata);
                createLog(udata._id, `Login Success For User ${username}`, req);
                return token;
            } catch (error) {
                createLog(undefined, `Login Failed For User ${username}`, req);
                throw error;
            }
        });
    });

    rtr.use("/logout", AuthMiddleware(decoder));
    rtr.use("/refreshToken", AuthMiddleware(decoder));
    rtr.use("/profile", AuthMiddleware(decoder));
    rtr.use("/changePassword", AuthMiddleware(decoder));
    rtr.use("/me", AuthMiddleware(decoder));

    rtr.get("/logout", (req, res) => {
        CtrlHandler(req, res, async (body) => {
            const { _id: user_id, username } = res.locals.udata;
            createLog(user_id, `${username} Logout`, req);
            return true;
        });
    });

    rtr.get("/refreshToken", (req, res) => {
        CtrlHandler(req, res, async (body) => {
            return refreshToken(res.locals.token);
        });
    });

    rtr.get("/me", (req, res) => {
        CtrlHandler(req, res, async (body) => {
            return res.locals.udata;
        });
    });

    rtr.post("/profile", (req, res) => {
        CtrlHandler(req, res, async (body) => {
            const { _id, username } = res.locals.udata;
            createLog(_id, `Update Profile for ${username}`, req);
            return await updateProfile(_id, body);
        });
    });

    rtr.post("/changePassword", (req, res) => {
        CtrlHandler(req, res, async (body) => {
            const { username, _id } = res.locals.udata;
            const { password, current } = body;
            await changePassword(username, current, password);
            createLog(_id, `Change password for ${username}`, req);
            return password;
        });
    });

    return rtr;
};
