const { JSDOM } = require("jsdom");

function isSafeHttpUrl(href) {
  if (!href) return false;
  try {
    const u = new URL(href, "http://localhost");
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeHtml(input) {
  if (!input || typeof input !== "string") return "";
  const dom = new JSDOM(`<body>${input}</body>`);
  const { document, NodeFilter } = dom.window;

  // Remove dangerous elements entirely
  document
    .querySelectorAll("script, iframe, object, embed, link, meta, style")
    .forEach((el) => el.remove());

  const sanitizeElement = (el) => {
    // Remove event handlers and sanitize URLs
    for (const attr of Array.from(el.attributes || [])) {
      const name = String(attr.name || "").toLowerCase();
      const value = String(attr.value || "");

      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (
        name === "href" ||
        name === "src" ||
        name === "xlink:href" ||
        name === "action" ||
        name === "formaction"
      ) {
        if (!isSafeHttpUrl(value)) {
          el.removeAttribute(attr.name);
          continue;
        }
      }
      if (name === "style" || name === "srcdoc") {
        el.removeAttribute(attr.name);
      }
    }

    // Recurse
    for (const child of Array.from(el.children || [])) sanitizeElement(child);
  };

  for (const el of Array.from(document.body.children || [])) sanitizeElement(el);

  // Remove HTML comments
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_COMMENT,
    null
  );
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach((n) => n.parentNode && n.parentNode.removeChild(n));

  return document.body.innerHTML;
}

module.exports = { sanitizeHtml };


