export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    const key = process.env.GOOGLE_VISION_API_KEY;
    if (!key) {
      return res.status(500).json({ ok: false, error: "Missing GOOGLE_VISION_API_KEY" });
    }

    const { imageBase64 } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ ok: false, error: "Missing imageBase64" });
    }

    // data URL prefix 제거
    const base64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const payload = {
      requests: [
        {
          image: { content: base64 },
          features: [{ type: "TEXT_DETECTION" }],
          imageContext: { languageHints: ["ko"] }
        }
      ]
    };

    const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(502).json({ ok: false, error: "OCR upstream error", detail: data });
    }

    const text =
      data?.responses?.[0]?.fullTextAnnotation?.text ||
      data?.responses?.[0]?.textAnnotations?.[0]?.description ||
      "";

    return res.status(200).json({ ok: true, text: (text || "").trim() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Server error", detail: String(e) });
  }
}
