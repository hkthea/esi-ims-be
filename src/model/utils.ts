import m, { Model } from 'mongoose';

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 10;
// Fields that must never be sent inside $set when a record is updated.
const IMMUTABLE_FIELDS = ['_id', 'createdBy', 'createdAt', '__v'];

const toObjectId = (id: string) => new m.Types.ObjectId(id);

export const reqPaging = async (schema: Model<any>, page: number, perPage: number, filter: object = {}, sort: object = { _id: -1 }, projection: string = '') => {
    const currentPage = Number.isFinite(page) && page > 0 ? Math.trunc(page) : DEFAULT_PAGE;
    const currentPerPage = Number.isFinite(perPage) && perPage > 0 ? Math.trunc(perPage) : DEFAULT_PER_PAGE;
    const offset = (currentPage - 1) * currentPerPage;
    const [data, total] = await Promise.all([
        schema.find(filter, projection, { skip: offset, limit: currentPerPage, sort }),
        schema.countDocuments(filter),
    ]);
    return { data, total };
}

export const createModel = (schema: Model<any>) => {
    // Schemas that declare `deletedAt` get soft delete; others fall back to hard delete.
    const supportsSoftDelete = Boolean(schema.schema.path('deletedAt'));

    const insert = async (body: object, uid?: string) => {
        const payload: Record<string, unknown> = { ...body };
        delete payload._id;
        if (supportsSoftDelete) payload.deletedAt = null;
        if (uid) payload.createdBy = toObjectId(uid);
        return await schema.create(payload);
    }

    const update = async (body: object, id: string) => {
        const payload: Record<string, unknown> = { ...body };
        IMMUTABLE_FIELDS.forEach((field) => delete payload[field]);
        const filter = supportsSoftDelete
            ? { _id: toObjectId(id), deletedAt: null }
            : { _id: toObjectId(id) };
        return await schema.findOneAndUpdate(
            filter,
            { $set: payload },
            { new: true, runValidators: true }
        );
    }

    // Schemas that declare `deletedAt` are soft-deleted; others are removed permanently.
    const remove = async (id: string) => {
        const _id = toObjectId(id);
        if (!supportsSoftDelete) {
            return await schema.findOneAndDelete({ _id });
        }
        return await schema.findOneAndUpdate(
            { _id, deletedAt: null },
            { $set: { deletedAt: new Date() } },
            { new: true }
        );
    }

    return { insert, update, remove, reqPaging };
}

interface tquery {
    search: string
    page: number
    perPage: number
}

export const pagination = async (schema: Model<any>, defSearch: string[] = [], query: tquery) => {
    const { search, page, perPage } = query;
    const { reqPaging } = createModel(schema);
    let filter = {};
    if (search) {
        const o = [];
        const r = new RegExp(search, 'i');
        for (let iii = 0; iii < defSearch.length; iii++) {
            const f = defSearch[iii];
            o.push({ [f]: new RegExp(r, "i") });
        }
        filter = { ...filter, $or: o };
    }
    return await reqPaging(schema, page, perPage, filter)
}