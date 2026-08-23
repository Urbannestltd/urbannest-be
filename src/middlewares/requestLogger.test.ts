import { redactSensitiveQueryParams } from "./requestLogger";

describe("redactSensitiveQueryParams", () => {
  it("redacts a token query param", () => {
    expect(redactSensitiveQueryParams("/storage/sign-url?token=abc.def.ghi")).toBe(
      "/storage/sign-url?token=%5BREDACTED%5D",
    );
  });

  it("redacts multiple sensitive params while leaving others intact", () => {
    const result = redactSensitiveQueryParams(
      "/x?token=secret&access_token=other&folder=maintenance",
    );
    expect(result).toContain("token=%5BREDACTED%5D");
    expect(result).toContain("access_token=%5BREDACTED%5D");
    expect(result).toContain("folder=maintenance");
  });

  it("leaves a URL with no query string unchanged", () => {
    expect(redactSensitiveQueryParams("/tenant/dashboard/overview")).toBe(
      "/tenant/dashboard/overview",
    );
  });

  it("leaves a URL with only non-sensitive query params unchanged in content", () => {
    const result = redactSensitiveQueryParams("/tenant/visitors/history?period=TODAY");
    expect(result).toContain("period=TODAY");
    expect(result).not.toContain("REDACTED");
  });
});
