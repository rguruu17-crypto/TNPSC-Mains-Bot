const https = require("https");
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "assets", "emojis");
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const emojis = {
  bulb: "1f4a1",
  lightning: "26a1",
  doc: "1f4c4",
  check: "2705",
  pin: "1f4cc",
  target: "1f3af",
  red_circle: "1f534",
};

const dl = (code, name) =>
  new Promise((resolve, reject) => {
    const url = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/" + code + ".png";
    const dest = path.join(dir, name + ".png");
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) return reject(new Error("HTTP " + res.statusCode));
        const ws = fs.createWriteStream(dest);
        res.pipe(ws);
        ws.on("finish", () => resolve(dest));
        ws.on("error", reject);
      })
      .on("error", reject);
  });

Promise.all(Object.entries(emojis).map(([name, code]) => dl(code, name)))
  .then((files) => {
    console.log("Successfully saved emojis:", files.map((f) => path.basename(f)));
  })
  .catch((err) => {
    console.error("Download error:", err.message);
  });
