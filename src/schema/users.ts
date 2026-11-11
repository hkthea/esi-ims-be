
import populate from 'mongoose-autopopulate';
import m from 'mongoose';
const Schema = m.Schema
const sch = new Schema({
    username: { type: String, required: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    level: { type: Number, required: true },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    deletedAt: { type: Date, default: null },
    last_login: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, autopopulate: { select: 'username name email' }, ref: 'user' }
}, {
    timestamps: true
})

sch.index({ username: 1 }, { unique: true })
sch.index({ level: 1 })
sch.plugin(populate)

export default m.model('user', sch);
