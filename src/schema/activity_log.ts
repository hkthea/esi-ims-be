import m from 'mongoose';
import populate from 'mongoose-autopopulate';

const Schema = m.Schema
const sch = new Schema({
    user_id: { type: Schema.Types.ObjectId, autopopulate: { select: 'username name email' }, ref: 'user' },
    ip_address: String,
    log: String,
    createdAt: { type: Date, default: Date.now },
    deletedAt: { type: Date, default: null },
})

sch.index({ user_id: 1 });
sch.index({ ip_address: 1 });
sch.plugin(populate);

export default m.model('activity_log', sch);