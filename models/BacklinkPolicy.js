const mongoose = require("mongoose");

const BlogLinkPolicySchema = new mongoose.Schema(
	{
		policy: { type: String, enum: ["nofollow", "dofollow"], default: "nofollow" },
		externalOnly: { type: Boolean, default: true },
		whitelist: [{ type: String, trim: true }],
		blacklist: [{ type: String, trim: true }],
		maxExternalLinks: { type: Number, default: null },
		maxDofollowLinks: { type: Number, default: 5 },
		exceedMode: { type: String, enum: ["convert", "reject"], default: "convert" },
		openInNewTab: { type: Boolean, default: true },
		relWhenNofollow: { type: String, default: "nofollow ugc" },
		alwaysAddRelNoopener: { type: Boolean, default: true },
	},
	{ _id: false }
);

const BacklinkPolicySchema = new mongoose.Schema(
	{
		blogs: { type: BlogLinkPolicySchema, default: () => ({}) },
		internalDomains: [{ type: String, trim: true }],
		updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
	},
	{ timestamps: true }
);

module.exports = mongoose.model("BacklinkPolicy", BacklinkPolicySchema);



