const { JSDOM } = require("jsdom");

const isHttpUrl = (href) => {
	if (!href) return false;
	try {
		const url = new URL(href, "http://example.com");
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
};

const normalizeHost = (href, baseOrigin) => {
	try {
		const u = new URL(href, baseOrigin || "http://localhost");
		return u.hostname.toLowerCase();
	} catch {
		return "";
	}
};

const hostMatches = (host, domain) => {
	const h = String(host || "").toLowerCase();
	const d = String(domain || "").toLowerCase();
	return h === d || h.endsWith(`.${d}`);
};

const isExternal = (href, internalDomains, baseOrigin) => {
	const host = normalizeHost(href, baseOrigin);
	if (!host) return false;
	return !internalDomains.some((d) => hostMatches(host, d));
};

const mergeRel = (existing, required) => {
	const set = new Set(String(existing || "").split(/\s+/).filter(Boolean));
	String(required || "").split(/\s+/).forEach((t) => t && set.add(t));
	return Array.from(set).join(" ").trim();
};

function applyBlogLinkPolicy(html, policy, baseOrigin) {
	const stats = { totalLinks: 0, externalLinks: 0, nofollowApplied: 0, convertedToNofollow: 0, removed: 0, dofollowKept: 0 };
	if (!html || typeof html !== "string") return { html, stats };
	const dom = new JSDOM(`<body>${html}</body>`);
	const { document } = dom.window;
	const aTags = document.querySelectorAll("a[href]");
    const blogs = policy?.blogs || {};
    const internalDomains = policy?.internalDomains || [];
    const blacklist = Array.isArray(blogs.blacklist) ? blogs.blacklist : [];
    const whitelist = Array.isArray(blogs.whitelist) ? blogs.whitelist : [];
    // Normalize domain lists to hostnames to handle inputs like "https://github.com/"
    const normalizedBlacklist = blacklist
        .map((d) => normalizeHost(d, baseOrigin))
        .filter((h) => !!h);
    const normalizedWhitelist = whitelist
        .map((d) => normalizeHost(d, baseOrigin))
        .filter((h) => !!h);
	const relNofollow = blogs.relWhenNofollow || "nofollow ugc";
	const openInNewTab = blogs.openInNewTab !== false;
	const externalOnly = !!blogs.externalOnly;
	const maxDofollow = typeof blogs.maxDofollowLinks === "number" ? blogs.maxDofollowLinks : null;
	const exceedMode = blogs.exceedMode || "convert";
	const alwaysNoopener = blogs.alwaysAddRelNoopener !== false;
	const isGlobalNofollow = blogs.policy === "nofollow";

	let dofollowCount = 0;

	aTags.forEach((a) => {
		stats.totalLinks++;
		let href = a.getAttribute("href") || "";
		// sanitize protocol
		if (!isHttpUrl(href)) {
			// remove dangerous links but keep text
			const span = document.createElement("span");
			span.innerHTML = a.textContent || "";
			a.replaceWith(span);
			stats.removed++;
			return;
		}

        const external = isExternal(href, internalDomains, baseOrigin);
        const host = normalizeHost(href, baseOrigin);
		if (external) stats.externalLinks++;

		if (openInNewTab) a.setAttribute("target", "_blank");

		const shouldConsider = !externalOnly || external;
		let needNofollow = false;

        // Enforce blacklist: any external link pointing to a blacklisted domain becomes nofollow
        if (shouldConsider && external && normalizedBlacklist.some((d) => hostMatches(host, d))) {
			needNofollow = true;
		}
		if (isGlobalNofollow && shouldConsider) {
			needNofollow = true;
		}

		if (!needNofollow && shouldConsider && external && blogs.policy === "dofollow") {
			const hasNofollow = /(^|\s)nofollow(\s|$)/i.test(a.getAttribute("rel") || "");
			const countsAsDofollow = !hasNofollow;
			if (countsAsDofollow) {
				if (maxDofollow !== null && dofollowCount >= maxDofollow) {
					if (exceedMode === "reject") {
						throw new Error("Max dofollow links exceeded");
					} else {
						// convert extra dofollow to nofollow
						a.setAttribute("rel", mergeRel(a.getAttribute("rel"), relNofollow + (alwaysNoopener ? " noopener noreferrer" : "")));
						stats.convertedToNofollow++;
					}
				} else {
					dofollowCount++;
					stats.dofollowKept++;
				}
			}
		}

		if (needNofollow) {
			a.setAttribute("rel", mergeRel(a.getAttribute("rel"), relNofollow + (alwaysNoopener ? " noopener noreferrer" : "")));
			stats.nofollowApplied++;
		} else if (openInNewTab && alwaysNoopener) {
			a.setAttribute("rel", mergeRel(a.getAttribute("rel"), "noopener noreferrer"));
		}
	});

	return { html: document.body.innerHTML, stats };
}

module.exports = { applyBlogLinkPolicy };



