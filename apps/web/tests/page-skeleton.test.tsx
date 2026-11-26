import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PageSkeleton } from "../components/back-office/PageSkeleton";

describe("PageSkeleton", () => {
  it("announces the Bahasa loading copy through a status region", () => {
    const html = renderToStaticMarkup(
      <PageSkeleton label="Memuat pengguna…" testId="users-loading" withFilterBar />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-testid="users-loading"');
    expect(html).toContain("Memuat pengguna…");
  });

  it("renders no action a user could click before data arrives", () => {
    const html = renderToStaticMarkup(
      <PageSkeleton label="Memuat outlet…" testId="outlets-loading" />,
    );

    expect(html).not.toMatch(/<button[\s>]/);
    expect(html).not.toMatch(/<a[\s>]/);
    expect(html).not.toMatch(/<input[\s>]/);
    expect(html).not.toMatch(/<select[\s>]/);
  });

  it("only mirrors the filter bar on screens that have one", () => {
    const usersHtml = renderToStaticMarkup(
      <PageSkeleton label="Memuat pengguna…" testId="users-loading" withFilterBar />,
    );
    const outletsHtml = renderToStaticMarkup(
      <PageSkeleton label="Memuat outlet…" testId="outlets-loading" />,
    );

    expect(usersHtml).toContain('class="wp3-filterbar"');
    expect(outletsHtml).not.toContain('class="wp3-filterbar"');
  });
});
