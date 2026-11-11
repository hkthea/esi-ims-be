import m from 'mongoose';
import populate from 'mongoose-autopopulate';

const Schema = m.Schema
const sch = new Schema({
    name: { type: String, required: true, trim: true },
    prefix: { type: String, default: '', trim: true },
    code: { type: String, default: '', trim: true, uppercase: true },
    iata: { type: String, default: '', trim: true, uppercase: true },
    icao: { type: String, default: '', trim: true, uppercase: true },
    country: { type: String, default: '', trim: true, uppercase: true },
    deletedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, autopopulate: { select: 'username name email' }, ref: 'user' }
}, {
    timestamps: true
})

sch.index({ code: 1 })
sch.index({ name: 1 })
sch.plugin(populate)

export default m.model('airline', sch);
