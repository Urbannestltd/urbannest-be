import { assertOwned } from "./ownership";
import { NotFoundError } from "./apiError";

describe("assertOwned", () => {
  it("does not throw when the resource exists and isOwned returns true", () => {
    expect(() => assertOwned({ id: "1" }, () => true, "not found")).not.toThrow();
  });

  it("throws NotFoundError when the resource is null", () => {
    expect(() => assertOwned(null, () => true, "not found")).toThrow(NotFoundError);
  });

  it("throws NotFoundError when the resource is undefined", () => {
    expect(() => assertOwned(undefined, () => true, "not found")).toThrow(NotFoundError);
  });

  it("throws NotFoundError (not Forbidden/BadRequest) when isOwned returns false", () => {
    expect(() => assertOwned({ id: "1" }, () => false, "not found")).toThrow(NotFoundError);
  });
});
