/**
 * Privacy notice loader.
 *
 * Notices are versioned Markdown files under src/content/privacy-notices/.
 * Naming: v<MAJOR>.<MINOR>.<lang>.md (e.g. v1.0.en.md, v1.2.kn.md).
 *
 * The "latest" notice is the one with the highest semver-style version
 * number. Every consent record records the notice_version it was captured
 * against — so if we publish v1.1, customers with v1.0 consent get prompted
 * to renew on next interaction.
 *
 * Notices are loaded eagerly at module init for fast reads. To add a new
 * version: drop a new MD file in src/content/privacy-notices/ and bump the
 * deploy. No DB change needed.
 */

import fs from "node:fs";
import path from "node:path";
import type { PrivacyNotice } from "@/lib/lms/types";

const NOTICES_DIR = path.join(process.cwd(), "src/content/privacy-notices");

/**
 * Frontmatter is `--- key: value ---` at the top of each MD file. Minimal
 * parser so we don't pull in a YAML dep just for three keys.
 */
function parseFrontmatter(raw: string): {
    frontmatter: Record<string, string>;
    body: string;
} {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { frontmatter: {}, body: raw };
    const frontmatter: Record<string, string> = {};
    for (const line of match[1].split("\n")) {
        const idx = line.indexOf(":");
        if (idx === -1) continue;
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        frontmatter[k] = v;
    }
    return { frontmatter, body: match[2] };
}

let cache: PrivacyNotice[] | null = null;

function loadAll(): PrivacyNotice[] {
    if (cache) return cache;
    if (!fs.existsSync(NOTICES_DIR)) {
        cache = [];
        return cache;
    }
    const files = fs.readdirSync(NOTICES_DIR).filter((f) => f.endsWith(".md"));
    const notices: PrivacyNotice[] = [];
    for (const file of files) {
        const raw = fs.readFileSync(path.join(NOTICES_DIR, file), "utf8");
        const { frontmatter, body } = parseFrontmatter(raw);
        notices.push({
            version: frontmatter.version ?? file.split(".").slice(0, 2).join("."),
            language: (frontmatter.language ?? "en") as PrivacyNotice["language"],
            publishedAt: frontmatter.publishedAt ?? new Date(0).toISOString(),
            bodyMarkdown: body,
        });
    }
    cache = notices;
    return cache;
}

/** Sort versions like 'v1.0', 'v1.10', 'v2.0' correctly. Returns -1 / 0 / 1. */
function compareVersions(a: string, b: string): number {
    const partsA = a.replace(/^v/, "").split(".").map(Number);
    const partsB = b.replace(/^v/, "").split(".").map(Number);
    const len = Math.max(partsA.length, partsB.length);
    for (let i = 0; i < len; i++) {
        const pa = partsA[i] ?? 0;
        const pb = partsB[i] ?? 0;
        if (pa !== pb) return pa < pb ? -1 : 1;
    }
    return 0;
}

/** Latest notice for a given language. Falls back to English if not available. */
export function getLatestNotice(language: PrivacyNotice["language"] = "en"): PrivacyNotice {
    const all = loadAll();
    const inLang = all.filter((n) => n.language === language);
    const fallback = all.filter((n) => n.language === "en");
    const pool = inLang.length > 0 ? inLang : fallback;
    if (pool.length === 0) {
        throw new Error("[notice] no privacy notices found in src/content/privacy-notices/");
    }
    return [...pool].sort((a, b) => compareVersions(b.version, a.version))[0];
}

/** Look up a specific version (any language). Used when serving back the
 *  notice text that was active when a consent was captured. */
export function getNoticeByVersion(
    version: string,
    language: PrivacyNotice["language"] = "en",
): PrivacyNotice | null {
    const all = loadAll();
    return (
        all.find((n) => n.version === version && n.language === language) ??
        all.find((n) => n.version === version && n.language === "en") ??
        null
    );
}
