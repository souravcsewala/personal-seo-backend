const mongoose = require("mongoose");

const PollVoteSchema = new mongoose.Schema(
	{
		poll: { type: mongoose.Schema.Types.ObjectId, ref: "Poll", required: true },
		user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
		optionIndexes: [{ type: Number, required: true }],
	},
	{ timestamps: true }
);

PollVoteSchema.index({ poll: 1, user: 1 }, { unique: true });

module.exports = mongoose.model("PollVote", PollVoteSchema);



