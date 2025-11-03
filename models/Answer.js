const mongoose = require("mongoose");

const AnswerSchema = new mongoose.Schema(
	{
		question: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
		author: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
		content: { type: String, required: true, trim: true },
		likes: { type: Number, default: 0 },
		likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
		isAccepted: { type: Boolean, default: false },
		replies: [
			{
				user: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
				content: { type: String, required: true, trim: true },
				parentId: { type: mongoose.Schema.Types.ObjectId },
				createdAt: { type: Date, default: Date.now },
			}
		],
	},
	{ timestamps: true }
);

AnswerSchema.index({ question: 1, createdAt: -1 });
AnswerSchema.index({ author: 1 });

module.exports = mongoose.model("Answer", AnswerSchema);



