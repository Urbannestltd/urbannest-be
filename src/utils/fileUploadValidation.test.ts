import { validateUploadFilename, validateUploadFolder } from "./fileUploadValidation";
import { BadRequestError } from "./apiError";

describe("validateUploadFilename", () => {
  it("rejects a .php file regardless of case or double extension tricks", () => {
    expect(() => validateUploadFilename("leak.php")).toThrow(BadRequestError);
    expect(() => validateUploadFilename("leak.PHP")).toThrow(BadRequestError);
    expect(() => validateUploadFilename("leak.jpg.php")).toThrow(BadRequestError);
  });

  it("rejects other executable/script extensions", () => {
    for (const ext of ["exe", "sh", "js", "bat", "cmd", "jar", "py", "html", "svg"]) {
      expect(() => validateUploadFilename(`payload.${ext}`)).toThrow(BadRequestError);
    }
  });

  it("rejects filenames with no extension", () => {
    expect(() => validateUploadFilename("noextension")).toThrow(BadRequestError);
  });

  it("rejects path traversal / separator characters", () => {
    expect(() => validateUploadFilename("../../etc/passwd.jpg")).toThrow(BadRequestError);
    expect(() => validateUploadFilename("folder/leak.jpg")).toThrow(BadRequestError);
    expect(() => validateUploadFilename("..\\leak.jpg")).toThrow(BadRequestError);
  });

  it("rejects an empty or overlong filename", () => {
    expect(() => validateUploadFilename("")).toThrow(BadRequestError);
    expect(() => validateUploadFilename("a".repeat(256) + ".jpg")).toThrow(BadRequestError);
  });

  it("allows expected image/document/video types", () => {
    for (const name of ["photo.jpg", "photo.JPEG", "scan.pdf", "report.docx", "clip.mp4"]) {
      expect(() => validateUploadFilename(name)).not.toThrow();
    }
  });
});

describe("validateUploadFolder", () => {
  it("rejects traversal attempts and absolute paths", () => {
    expect(() => validateUploadFolder("../secrets")).toThrow(BadRequestError);
    expect(() => validateUploadFolder("/etc")).toThrow(BadRequestError);
    expect(() => validateUploadFolder("")).toThrow(BadRequestError);
  });

  it("allows a plain folder name", () => {
    expect(() => validateUploadFolder("maintenance")).not.toThrow();
  });
});
