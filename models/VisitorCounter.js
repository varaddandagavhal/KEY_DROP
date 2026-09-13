const mongoose = require('mongoose');

const visitorCounterSchema = new mongoose.Schema({
    name: {
        type: String,
        unique: true,
        default: 'site-visits'
    },
    count: {
        type: Number,
        default: 299
    }
});

module.exports = mongoose.model('VisitorCounter', visitorCounterSchema);