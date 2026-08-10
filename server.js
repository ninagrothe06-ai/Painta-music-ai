const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");

function sendJson(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(obj));
}

function buildPrompt(d) {
  return [
    `Create an original ${d.style || "pop"} song.`,
    `Language: ${d.language || "German"}.`,
    d.voiceInstruction || "",
    d.mood ? `Sound and mood: ${d.mood}.` : "",
    d.extra ? `Arrangement: ${d.extra}.` : "",
    d.voice === "instrumental"
      ? "Instrumental only."
      : `Use these lyrics:\n\n${d.lyrics || ""}`,
    `Title: ${d.title || "Untitled"}.`
  ].filter(Boolean).join("\n\n");
}

async function generate(req, res) {
  if (!process.env.GEMINI_API_KEY) {
    return sendJson(res, 500, {
      error: "GEMINI_API_KEY fehlt."
    });
  }

  let body = "";

  req.on("data", chunk => body += chunk);

  req.on("end", async () => {
    try {
      const d = JSON.parse(body || "{}");

      const model =
        d.duration === "clip"
          ? "lyria-3-clip-preview"
          : "lyria-3-pro-preview";

      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            model,
            input: buildPrompt(d)
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        return sendJson(res, response.status, {
          error: result?.error?.message || "Musikgenerierung fehlgeschlagen."
        });
      }

      let audio = null;
      let mimeType = "audio/mpeg";

      for (const step of result.steps || []) {
        if (step.type !== "model_output") continue;

        for (const content of step.content || []) {
          if (content.type === "audio" && content.data) {
            audio = content.data;
            mimeType =
              content.mime_type ||
              content.mimeType ||
              mimeType;
          }
        }
      }

      if (!audio) {
        return sendJson(res, 502, {
          error: "Keine Audiodatei erhalten."
        });
      }

      sendJson(res, 200, {
        audioBase64: audio,
        mimeType
      });

    } catch (error) {
      sendJson(res, 500, {
        error: error.message
      });
    }
  });
}

const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml"
};

http.createServer((req, res) => {

  if (req.method === "POST" && req.url === "/api/generate") {
    return generate(req, res);
  }

  let url = req.url.split("?")[0];

  if (url === "/") {
    url = "/index.html";
  }

  const file = path.join(PUBLIC, url);

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }

    res.writeHead(200, {
      "Content-Type":
        types[path.extname(file)] ||
        "application/octet-stream"
    });

    res.end(data);
  });

}).listen(PORT, () => {
  console.log(`Painta Music läuft auf Port ${PORT}`);
});
