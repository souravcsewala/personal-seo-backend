const mongoose = require("mongoose");

const AnswerSchema = new mongoose.Schema(
	{
		question: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
		author: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
		content: { type: String, required: true, trim: true },
		likes: { type: Number, default: 0 },
		likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
		isAccepted: { type: Boolean, default: false },
	},
	{ timestamps: true }
);

AnswerSchema.index({ question: 1, createdAt: -1 });
AnswerSchema.index({ author: 1 });

module.exports = mongoose.model("Answer", AnswerSchema);



