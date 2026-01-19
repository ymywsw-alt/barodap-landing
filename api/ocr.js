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

    // 1) DOCUMENT_TEXT_DETECTION 우선 (고지서/영수증/문서에 강함)
    // 2) languageHints: ko (한국어 문서 안정화)
    // 3) textDetectionParams: 더티 텍스트 개선
    const payload = {
      requests: [
        {
          image: { content: imageBase64 },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          imageContext: {
            languageHints: ["ko"],
            textDetectionParams: {
              enableTextDetectionConfidenceScore: true
            }
          }
        }
      ]
    };

    const r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      const msg = data?.error?.message || "Vision API error";
      return res.status(500).json({ ok: false, error: msg });
    }

    const resp = data?.responses?.[0] || {};
    const fullText = resp?.fullTextAnnotation?.text || "";

    // fallback: TEXT_DETECTION 결과라도 있으면 이어붙임
    let fallbackText = "";
    if (!fullText && Array.isArray(resp?.textAnnotations) && resp.textAnnotations.length > 0) {
      fallbackText = resp.textAnnotations.map(x => x?.description).filter(Boolean).join("\n");
    }

    const text = (fullText || fallbackText || "").trim();

    // 실패 상세를 프론트가 판단하도록 "reason" 제공
    if (!text) {
      return res.status(200).json({
        ok: true,
        text: "",
        reason: "NO_TEXT_DETECTED"
      });
    }

    return res.status(200).json({
      ok: true,
      text,
      meta: {
        // 디버그용(필요시 UI에 노출 안 해도 됨)
        hasFullText: !!fullText,
      }
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
}
