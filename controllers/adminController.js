const BacklinkPolicy = require("../models/BacklinkPolicy");
const ErrorHandeler = require("../special/errorHandelar");
const Blog = require("../models/Blog");
const Question = require("../models/Question");
const Poll = require("../models/Poll");
const User = require("../models/User");
const { getSignedUrlForKey } = require("../special/s3Client");
const mongoose = require("mongoose");

const getBlogLinkPolicy = async (req, res, next) => {
	try {
		let policy = await BacklinkPolicy.findOne();
		if (!policy) {
			policy = await BacklinkPolicy.create({});
		}
		res.json({ success: true, data: { blogs: policy.blogs, internalDomains: policy.internalDomains } });
	} catch (error) {
		next(error);
	}
};

const updateBlogLinkPolicy = async (req, res, next) => {
	try {
		const { blogs, internalDomains } = req.body || {};
		let policy = await BacklinkPolicy.findOne();
		if (!policy) policy = new BacklinkPolicy({});
		if (blogs && typeof blogs === "object") {
			for (const key of [
				"policy",
				"externalOnly",
				"whitelist",
				"blacklist",
				"maxExternalLinks",
				"maxDofollowLinks",
				"exceedMode",
				"openInNewTab",
				"relWhenNofollow",
				"alwaysAddRelNoopener",
			]) {
				if (typeof blogs[key] !== "undefined") {
					policy.blogs[key] = blogs[key];
				}
			}
		}
		if (Array.isArray(internalDomains)) policy.internalDomains = internalDomains;
		policy.updatedBy = req.userid || (req.user && req.user._id) || undefined;
		await policy.save();
		res.json({ success: true, data: { blogs: policy.blogs, internalDomains: policy.internalDomains } });
	} catch (error) {
		next(error);
	}
};

// Create Blog Link Policy (admin): creates a policy; 409 if one already exists
const createBlogLinkPolicy = async (req, res, next) => {
  try {
    const { blogs, internalDomains } = req.body || {};
    const existing = await BacklinkPolicy.findOne();
    if (existing) {
      return next(new ErrorHandeler("Policy already exists.", 409));
    }

    let policyDoc = new BacklinkPolicy({});
    if (blogs && typeof blogs === "object") {
      for (const key of [
        "policy",
        "externalOnly",
        "whitelist",
        "blacklist",
        "maxExternalLinks",
        "maxDofollowLinks",
        "exceedMode",
        "openInNewTab",
        "relWhenNofollow",
        "alwaysAddRelNoopener",
      ]) {
        if (typeof blogs[key] !== "undefined") policyDoc.blogs[key] = blogs[key];
      }
    }
    if (Array.isArray(internalDomains)) policyDoc.internalDomains = internalDomains;
    policyDoc.updatedBy = req.userid || (req.user && req.user._id) || undefined;
    await policyDoc.save();
    res.status(201).json({ success: true, data: { blogs: policyDoc.blogs, internalDomains: policyDoc.internalDomains } });
  } catch (error) {
    next(error);
  }
};

// Delete Blog Link Policy (admin): removes the single policy document if it exists
const deleteBlogLinkPolicy = async (req, res, next) => {
  try {
    const existing = await BacklinkPolicy.findOne();
    if (!existing) {
      return next(new ErrorHandeler("Policy not found.", 404));
    }
    await existing.deleteOne();
    res.json({ success: true, message: "Backlink policy deleted." });
  } catch (error) {
    next(error);
  }
};

module.exports = { getBlogLinkPolicy, updateBlogLinkPolicy, createBlogLinkPolicy, deleteBlogLinkPolicy };
// Public alias for clients to read policy without admin guard
module.exports.getBlogLinkPolicyPublic = getBlogLinkPolicy;



	// Admin Dashboard Overview
	// Returns totals and key counts used by the frontend admin dashboard
	const getDashboardOverview = async (req, res, next) => {
		try {
			const now = new Date();
			const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

			const [
				totalBlogs,
				approvedBlogs,
				pendingBlogs,
				rejectedBlogs,
				totalQuestions,
				totalPolls,
				totalUsers,
				activeUsers,
				newUsersThisMonth,
			] = await Promise.all([
				Blog.countDocuments({}),
				Blog.countDocuments({ status: "approved" }),
				Blog.countDocuments({ $or: [{ status: "pending" }, { status: { $exists: false } }] }),
				Blog.countDocuments({ status: "rejected" }),
				Question.countDocuments({}),
				Poll.countDocuments({}),
				User.countDocuments({}),
				User.countDocuments({ isBlocked: false }),
				User.countDocuments({ createdAt: { $gte: monthStart } }),
			]);

			return res.json({
				success: true,
				data: {
					content: {
						totalBlogs,
						totalQuestions,
						totalPolls,
						blogsByStatus: {
							approved: approvedBlogs,
							pending: pendingBlogs,
							declined: rejectedBlogs,
						},
					},
					users: {
						totalUsers,
						activeUsers,
						newUsersThisMonth,
					},
				},
			});
		} catch (error) {
			next(error);
		}
	};

	module.exports.getDashboardOverview = getDashboardOverview;

// List users (admin): supports search and pagination, includes posts count
const listUsers = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1"), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "12"), 1), 100);
    const search = String(req.query.search || "").trim();

    const match = {};
    if (search) {
      match.$or = [
        { fullname: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      User.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: "blogs",
            localField: "_id",
            foreignField: "author",
            as: "_blogs",
          },
        },
        { $addFields: { posts: { $size: "$_blogs" } } },
        { $project: { password: 0, _blogs: 0 } },
      ]),
      User.countDocuments(match),
    ]);

    // Attach signed URL for private profile images
    for (const u of items) {
      try {
        if (u && u.profileimage && u.profileimage.key) {
          const signed = await getSignedUrlForKey(u.profileimage.key, 3600);
          u.profileimage.signedUrl = signed;
        }
      } catch (_) {}
    }

    res.json({ success: true, data: items, pagination: { page, limit, total } });
  } catch (error) {
    next(error);
  }
};

// Get user by id (admin)
const getUserByIdAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || !String(id).match(/^[0-9a-fA-F]{24}$/)) {
      return next(new ErrorHandeler("Invalid user id", 400));
    }

    const user = await User.findById(id).select("-password");
    if (!user) return next(new ErrorHandeler("User not found", 404));

    const plain = user.toObject();
    try {
      if (plain && plain.profileimage && plain.profileimage.key) {
        plain.profileimage.signedUrl = await getSignedUrlForKey(plain.profileimage.key, 3600);
      }
    } catch (_) {}

    const posts = await Blog.countDocuments({ author: user._id });
    res.json({ success: true, data: { ...plain, posts } });
  } catch (error) {
    next(error);
  }
};

// List blogs for admin with status filter and search
const listBlogsAdmin = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1"), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "12"), 1), 100);
    const statusRaw = String(req.query.status || "").trim().toLowerCase();
    // map UI term 'declined' to 'rejected'
    const status = statusRaw === "declined" ? "rejected" : statusRaw;
    const search = String(req.query.search || "").trim();

    const filter = {};
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
    }
    if (search) {
      filter.title = { $regex: search, $options: "i" };
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Blog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("title slug image imageKey imageAlt status createdAt author")
        .populate({ path: "author", select: "fullname profileimage" })
        .lean(),
      Blog.countDocuments(filter),
    ]);

    for (const b of items) {
      if (b.imageKey) {
        try { b.signedUrl = await getSignedUrlForKey(b.imageKey, 3600); } catch (_) {}
      }
    }

    res.json({ success: true, data: items, pagination: { page, limit, total } });
  } catch (error) {
    next(error);
  }
};

// Update blog status (admin)
const setBlogStatusAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!id || !String(id).match(/^[0-9a-fA-F]{24}$/)) {
      return next(new ErrorHandeler("Invalid blog id", 400));
    }
    const normalized = String(status || "").toLowerCase();
    const mapped = normalized === "declined" ? "rejected" : normalized;
    if (!["pending", "approved", "rejected"].includes(mapped)) {
      return next(new ErrorHandeler("Invalid status", 400));
    }

    const updated = await Blog.findByIdAndUpdate(
      id,
      { status: mapped },
      { new: true }
    ).select("_id status title");
    if (!updated) return next(new ErrorHandeler("Blog not found", 404));

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

module.exports.listUsers = listUsers;
module.exports.getUserByIdAdmin = getUserByIdAdmin;
module.exports.listBlogsAdmin = listBlogsAdmin;
module.exports.setBlogStatusAdmin = setBlogStatusAdmin;

