import fs from "fs";
import path from "path";

const footerHtml = fs.readFileSync(
  path.join(__dirname, "footer.html"),
  "utf-8"
);

export const combinedPartials = {
  footer: footerHtml,
};
